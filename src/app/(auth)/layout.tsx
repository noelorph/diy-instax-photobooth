export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="public-auth">
      <section className="auth-panel">{children}</section>
    </main>
  );
}
