import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // base './' asegura que los assets usen rutas relativas en el build,
  // necesario para que Express los sirva correctamente.
  base: './',
})
