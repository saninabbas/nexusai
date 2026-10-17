import type { Metadata } from "next";
import "./globals.css";
import { OFFICIAL_SITE_URL } from "../lib/product";
export const metadata: Metadata = {
  metadataBase:new URL(OFFICIAL_SITE_URL),
  title:{default:"Nexus Trader — Browser-Native Futures Control",template:"%s | Nexus Trader"},
  description:"A Chrome and Edge platform for Binance Futures strategy controls, automated USDT BEP20 payment verification and one-device licensing.",
  keywords:["Binance Futures bot","Chrome trading extension","BEP20 licence","trading bot dashboard","Nexus Trader"],
  verification:{other:{"fameswap-verification":"GbR2vbGrJsBoqINWTLnPaRQRkiZgFi9a","msvalidate.01":"21F322662A2D24A02921E48351C71C99"}},
  alternates:{canonical:"/"},robots:{index:true,follow:true},
  openGraph:{type:"website",url:"/",siteName:"Nexus Trader",title:"Nexus Trader — Browser-Native Futures Control",description:"Strategy controls, automated payment verification and device-bound licensing in one browser extension."},
  twitter:{card:"summary",title:"Nexus Trader",description:"Browser-native futures control with automated licensing."},
  icons:{icon:"/logo.png",shortcut:"/logo.png"}
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-PJZJWX6Z8C"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-PJZJWX6Z8C');
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
