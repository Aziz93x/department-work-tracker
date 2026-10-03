import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"قسم التقنية الكهربائية",description:"مساحة إدارة ومتابعة أعمال قسم التقنية الكهربائية",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
