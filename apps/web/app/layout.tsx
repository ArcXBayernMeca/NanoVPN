import type { ReactNode } from "react";

export const metadata = {
  title: "NanoVPN",
  description: "Pay only for the data you use.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
