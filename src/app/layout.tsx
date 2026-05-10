import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "ABS Accounts Portal",
  description: "Community portal powered by Next.js and Firebase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
