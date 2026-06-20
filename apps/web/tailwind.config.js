/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        workspace: {
          main: "#151515",
          sidebar: "#262626",
          "sidebar-hover": "#3d3d3d",
          elevated: "#1e1e1e",
          border: "#2e2e2e",
          "border-subtle": "#333333",
        },
      },
    },
  },
  plugins: [],
};
