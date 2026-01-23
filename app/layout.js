// app/layout.jsx
import "./globals.css";
import { Providers } from "./providers";
import MobileOnlyGuard from "@/components/guards/MobileOnlyGuard";

export const metadata = {
  title: "GDS Attendance Portal",
  description: "Global Digital Solutions Attendance & HR Portal",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {/* ✅ Mobile-only restriction guard */}
        <MobileOnlyGuard>
          {/* ✅ Now the whole app (including /login) is wrapped in SessionProvider */}
          <Providers>{children}</Providers>
        </MobileOnlyGuard>
      </body>
    </html>
  );
}
