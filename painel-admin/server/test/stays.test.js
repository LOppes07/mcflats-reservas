import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapListing, mapHood, extractPhotos, staysConfigured, reservationsToBlocks, nightlyFromPriceResp } from '../src/stays.js';

// Sample real do formato de listing da doc do Stays (stays.net/external-api).
const SAMPLE = {
  _id: '5c5d8937a637940010c06c9b',
  id: 'LY04F',
  _idproperty: '5c5c94c87ab5390010e148b7',
  internalName: 'AR0310 - Studio Standard',
  _mstitle: { pt_BR: 'Studio Standard', en_US: 'Studio Standard' },
  _msdesc: { pt_BR: '<p>Lindo studio no <b>Leblon</b>, pertinho da praia.</p>', en_US: 'Nice studio' },
  _i_maxGuests: 2,
  _i_rooms: 1,
  _i_beds: 1,
  _f_bathrooms: 1,
  address: { countryCode: 'BR', state: 'RJ', stateCode: 'RJ', city: 'Rio de Janeiro', region: 'Leblon', street: 'Rua Ataulfo de Paiva', streetNumber: '100', zip: '22440-030' },
  latLng: { _f_lat: -22.98, _f_lng: -43.22 },
  _idmainImage: '5c9d44da8dca990010557182',
  _t_mainImageMeta: { url: 'https://play.stays.net/image/d235/5c9d44da8dca990010557182' },
};

test('mapListing extrai os campos conhecidos do Stays', () => {
  const m = mapListing(SAMPLE);
  assert.equal(m.staysId, '5c5d8937a637940010c06c9b');
  assert.equal(m.code, 'LY04F');
  assert.equal(m.name, 'Studio Standard');            // usa o título público, não o internalName
  assert.equal(m.bedrooms, 1);
  assert.equal(m.bathrooms, 1);
  assert.equal(m.guests, 2);
  assert.equal(m.hood, 'leblon');                       // derivado do address.region
  assert.equal(m.description, 'Lindo studio no Leblon, pertinho da praia.'); // HTML removido
  assert.match(m.address, /Ataulfo de Paiva/);
  assert.equal(m.price, 0);                             // preço-base vem depois
});

test('mapListing marca active a partir do status do Stays (active vs hidden)', () => {
  assert.equal(mapListing({ _id: 'x', status: 'active', _mstitle: { pt_BR: 'A' } }).active, true);
  assert.equal(mapListing({ _id: 'y', status: 'hidden', _mstitle: { pt_BR: 'B' } }).active, false);
  assert.equal(mapListing({ _id: 'z', _mstitle: { pt_BR: 'C' } }).active, false); // sem status = não ativo
});

test('mapListing tira o prefixo redundante "MC FLATS" do nome', () => {
  const m = mapListing({ _id: 'x', _mstitle: { pt_BR: 'MC FLATS IPANEMA BEACH STAR - APARTAMENTO 101' }, address: { region: 'Ipanema' } });
  assert.equal(m.name, 'IPANEMA BEACH STAR - APARTAMENTO 101');
});

test('mapHood cai em ipanema por padrão e detecta leblon', () => {
  assert.equal(mapHood({ region: 'Ipanema' }), 'ipanema');
  assert.equal(mapHood({ region: 'Leblon' }), 'leblon');
  assert.equal(mapHood({ street: 'Av. Delfim Moreira - Leblon' }), 'leblon');
  assert.equal(mapHood({}), 'ipanema');
});

test('extractPhotos reescreve o domínio para o da conta e dedupe', () => {
  // Sem STAYS_BASE_URL no ambiente de teste, rewrite mantém a URL original — ainda assim dedupe.
  const photos = extractPhotos({
    _t_mainImageMeta: { url: 'https://play.stays.net/image/a' },
    images: [{ url: 'https://play.stays.net/image/a' }, { url: 'https://play.stays.net/image/b' }],
  });
  assert.equal(photos.length, 2);                       // 'a' duplicado foi removido
});

test('reservationsToBlocks: reserva booked vira bloqueio (fim = checkout - 1)', () => {
  const r = reservationsToBlocks([{ type: 'booked', checkInDate: '2026-09-03', checkOutDate: '2026-09-08' }]);
  assert.deepEqual(r, [{ start: '2026-09-03', end: '2026-09-07' }]); // dorme 03..07, sai dia 08
});

test('reservationsToBlocks ignora canceladas e orçamentos', () => {
  const r = reservationsToBlocks([
    { type: 'canceled', checkInDate: '2026-09-03', checkOutDate: '2026-09-08' },
    { type: 'quotation', checkInDate: '2026-10-01', checkOutDate: '2026-10-05' },
    { type: 'booked', checkInDate: '2026-11-01', checkOutDate: '2026-11-02' },
  ]);
  assert.deepEqual(r, [{ start: '2026-11-01', end: '2026-11-01' }]); // só a booked (1 noite)
});

test('extractPhotos usa a galeria _t_imagesMeta (capa area=main primeiro)', () => {
  const photos = extractPhotos({
    _t_imagesMeta: [
      { _id: 'b', url: 'https://mcf.stays.com.br/image/b', area: 'others' },
      { _id: 'a', url: 'https://mcf.stays.com.br/image/a', area: 'main' },
    ],
  });
  assert.equal(photos.length, 2);
  assert.match(photos[0], /\/image\/a$/); // a (main) primeiro
});

test('nightlyFromPriceResp deriva a diária (total - taxas) / noites', () => {
  const resp = [{ _idlisting: 'x', _mctotal: { BRL: 4379 }, fees: [{ _mcval: { BRL: 209 } }] }];
  // (4379 - 209) / 3 noites = 1390
  assert.equal(nightlyFromPriceResp(resp, '2026-09-10', '2026-09-13'), 1390);
});

test('staysConfigured é false sem credenciais no .env de teste', () => {
  assert.equal(staysConfigured(), false);
});
