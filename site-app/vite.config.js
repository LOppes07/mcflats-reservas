import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base: './' lets the built site work both on Vercel (root) and when opened
// from a sub-path / file system.
export default defineConfig({
    base: './',
    plugins: [react()],
    // Em dev, encaminha as chamadas da API/fotos para o servidor do painel (:8092),
    // para o site já mostrar os imóveis cadastrados. Em produção o nginx faz o mesmo.
    server: {
        proxy: {
            '/api': 'http://localhost:8092',
            '/uploads': 'http://localhost:8092',
        },
    },
});
