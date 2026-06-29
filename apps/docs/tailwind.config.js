/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#FF5C33",
          muted: "#FFF0EB",
          hover: "#E54D26",
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            color: "#374151",
            a: {
              color: "#111827",
              textDecoration: "none",
              "&:hover": {
                textDecoration: "underline",
              },
            },
            "h1, h2, h3, h4": {
              color: "#111827",
              fontWeight: "600",
            },
            code: {
              color: "#111827",
              backgroundColor: "#f3f4f6",
              padding: "0.125rem 0.375rem",
              borderRadius: "0.25rem",
              fontWeight: "400",
            },
            "code::before, code::after": {
              content: '""',
            },
            pre: {
              backgroundColor: "#1f2937",
              color: "#f9fafb",
            },
            "pre code": {
              backgroundColor: "transparent",
              color: "inherit",
              padding: 0,
            },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
