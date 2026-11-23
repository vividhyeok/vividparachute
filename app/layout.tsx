import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "vividparachute · 나만의 전과",
  description:
    "문제에서 출발해, 필요한 개념으로. 공부할수록 선명해지는 개인 전과.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
