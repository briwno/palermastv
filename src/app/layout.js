export const metadata = {
  title: 'PalermasTV',
  description: 'Futebol e transmissão do grupo Palermas.',
};
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
