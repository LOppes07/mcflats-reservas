import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O painel fala com a API sempre por caminho relativo (/api, /uploads).
// Em dev, o Vite faz proxy para a API local (:8092) — assim o cookie de sessão
// é same-origin (sameSite=lax funciona). Em produção, o nginx faz o mesmo proxy.
export default defineConfig({
  // Painel servido em https://dominio/painel/ (fixo aqui para não depender de
  // argumento --base no shell, que o Git Bash converte para caminho do Windows).
  base: '/painel/',
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8092',
      '/uploads': 'http://localhost:8092',
    },
  },
});
