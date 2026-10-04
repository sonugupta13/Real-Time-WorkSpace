import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real-Time Collaborative Workspace | RBAC Architecture",
  description:
    "Real-Time Collaborative Workspace with Role-Based Access Control built with TypeScript, Next.js, Express, PostgreSQL, Prisma, and Redis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
