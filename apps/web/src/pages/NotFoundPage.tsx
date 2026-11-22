import { AeroLink } from '../components/ui/AeroButton.tsx';
import './pages.css';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="empty glass glass--frost">
        <span className="empty__bubble" aria-hidden />
        <h1 className="page-title" style={{ color: 'var(--ink)', textShadow: 'none' }}>
          Essa página flutuou para longe
        </h1>
        <p>O endereço não existe. Se era uma sala, ela pode ter terminado.</p>
        <AeroLink to="/" icon="home">
          Voltar para o início
        </AeroLink>
      </div>
    </div>
  );
}
