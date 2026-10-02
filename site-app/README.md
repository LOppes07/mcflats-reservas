# MC Flats — Site

Site da MC Flats (apartamentos premium em Ipanema e Leblon) reconstruído como projeto **React + Vite + TypeScript**, a partir do HTML exportado original.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build de produção

```bash
npm run build    # gera ./dist (estático)
npm run preview  # serve o build localmente
```

Deploy: a pasta `dist/` é estática — sobe direto na Vercel, Netlify ou qualquer host.
Na Vercel: framework **Vite**, build `npm run build`, output `dist`.

## Estrutura

```
src/
  App.tsx      → app completo (home, resultados, detalhe, favoritos, reserva)
  css.tsx      → helper css() (string→objeto de estilo) + <Box> com hover
  data.ts      → os 11 apartamentos (APTS) + comodidades (AMEN)
  photos.ts    → mapa id→foto (import.meta.glob), fallback Unsplash
  images/      → logos, hero e cards de bairro
  photos/      → fotos dos apartamentos (bundladas, offline)
  index.css    → reset, fontes e keyframes
```

## Funcionalidades

- Home com hero parallax, busca, bairros, destaques e seção institucional
- Listagem com filtro por bairro, ordenação e favoritos
- Página de detalhe com galeria, comodidades, mapa e card de reserva
- Fluxo de reserva (modal) com validação + confirmação
- Integração WhatsApp (número `+55 21 98136-6864`)

## Notas técnicas

- Fontes **Manrope** e **Montserrat** via Google Fonts (`index.html`).
- Fotos dos apartamentos empacotadas localmente → funciona **offline**.
- Estado 100% client-side (sem backend). Para evoluir: extrair dados para uma
  API/CMS, adicionar rotas reais (React Router) e checkout/pagamento.
