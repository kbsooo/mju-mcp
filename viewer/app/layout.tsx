import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MJU Viewer",
  description: "명지대학교 학사정보 뷰어",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
