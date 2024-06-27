import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import postcssMixins from 'postcss-mixins';
import postcssImport from 'postcss-import';
import postcssNesting from 'postcss-nesting';
import tailwindNesting from 'tailwindcss/nesting/index.js';

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: [postcssMixins, postcssImport, tailwindNesting(postcssNesting), tailwind, autoprefixer],
};
