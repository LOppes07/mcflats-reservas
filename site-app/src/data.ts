export type Apt = {
  id: string;
  name: string;
  hood: 'ipanema' | 'leblon';
  bd: number;
  ba: number;
  guests: number;
  price: number;
  rating: number;
  reviews: number;
  tag: string;
  imgs: string[];
  description?: string;
  amenities?: string[];
  featured?: boolean;
  min_nights?: number;
  lat?: number | null;
  lng?: number | null;
};

export const APTS: Apt[] = [
  { id: '1', name: 'Monsieur Le Blond 606', hood: 'leblon', bd: 1, ba: 1, guests: 3, price: 690, rating: 4.9, reviews: 32, tag: '', imgs: ['1522708323590-d24dbb6b0267', '1505693416388-ac5ce068fe85', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1544989164-31dc3c645987'] },
  { id: '2', name: 'Leblon Inn 107', hood: 'leblon', bd: 1, ba: 1, guests: 3, price: 640, rating: 4.8, reviews: 27, tag: '', imgs: ['1493809842364-78817add7ffb', '1505691938895-1758d7feb511', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1483729558449-99ef09a8c325'] },
  { id: '3', name: 'Leblon Inn 404', hood: 'leblon', bd: 1, ba: 1, guests: 3, price: 720, rating: 5.0, reviews: 18, tag: 'Top avaliado', imgs: ['1545324418-cc1a3fa10c00', '1502005229762-cf1b2da7c5d6', '1484154218962-a197022b5858', '1583847268964-b28dc8f51f92', '1560449752-3fd4bdbe7df0'] },
  { id: '4', name: 'The Claridge 1101', hood: 'leblon', bd: 1, ba: 1, guests: 3, price: 880, rating: 4.9, reviews: 41, tag: 'Vista mar', imgs: ['1560185007-cde436f6a4d0', '1540518614846-7eded433c457', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1518639192441-8fce0a366e2e'] },
  { id: '5', name: 'Beach Star 403', hood: 'ipanema', bd: 1, ba: 1, guests: 3, price: 750, rating: 4.9, reviews: 56, tag: 'Mais reservado', imgs: ['1502672260266-1c1ef2d93688', '1502005229762-cf1b2da7c5d6', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1516306580123-e6e52b1b7b5f'] },
  { id: '6', name: 'Beach Star 201', hood: 'ipanema', bd: 1, ba: 1, guests: 2, price: 700, rating: 4.7, reviews: 22, tag: '', imgs: ['1554995207-c18c203602cb', '1505693416388-ac5ce068fe85', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1516306580123-e6e52b1b7b5f'] },
  { id: '7', name: 'Beach Star 102', hood: 'ipanema', bd: 1, ba: 1, guests: 3, price: 760, rating: 5.0, reviews: 39, tag: '', imgs: ['1586105251261-72a756497a11', '1522771739844-6a9f6d5f14af', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1544989164-31dc3c645987'] },
  { id: '8', name: 'Beach Star 101', hood: 'ipanema', bd: 1, ba: 2, guests: 3, price: 820, rating: 4.8, reviews: 30, tag: '', imgs: ['1600585154340-be6161a56a0c', '1540518614846-7eded433c457', '1484154218962-a197022b5858', '1583847268964-b28dc8f51f92', '1518639192441-8fce0a366e2e'] },
  { id: '9', name: 'Vinicius Studio 802', hood: 'ipanema', bd: 0, ba: 1, guests: 2, price: 580, rating: 4.8, reviews: 44, tag: 'Studio', imgs: ['1600566753086-00f18fb6b3ea', '1505691938895-1758d7feb511', '1567767292278-a4f21aa2d36e', '1571508601891-ca5e7a713859', '1483729558449-99ef09a8c325'] },
  { id: '10', name: 'Farme 305', hood: 'ipanema', bd: 2, ba: 2, guests: 4, price: 980, rating: 4.9, reviews: 61, tag: '2 quartos', imgs: ['1560448204-e02f11c3d0e2', '1522771739844-6a9f6d5f14af', '1484154218962-a197022b5858', '1583847268964-b28dc8f51f92', '1560449752-3fd4bdbe7df0'] },
  { id: '11', name: 'Prudente 1204', hood: 'ipanema', bd: 1, ba: 1, guests: 2, price: 690, rating: 4.7, reviews: 25, tag: '', imgs: ['1600210492486-724fe5c67fb0', '1502005229762-cf1b2da7c5d6', '1556911220-bff31c812dba', '1507652313519-d4e9174996dd', '1516306580123-e6e52b1b7b5f'] },
];

export const AMEN: string[] = [
  'Wi-Fi de alta velocidade',
  'Cozinha completa',
  'Arrumação diária',
  'Recepção 24 horas',
  'Ar-condicionado',
  'Vaga privativa',
  'Estação de trabalho',
  'Smart TV',
];
