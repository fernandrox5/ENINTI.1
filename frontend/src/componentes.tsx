// Componentes de interfaz comunes (estilo de los mockups de Syntia)
import { useEffect, useId, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, X, Loader2 } from 'lucide-react';

export function Marca({ sub }: { sub?: string }) {
  return (
    <Link to="/" className="marca" aria-label="Syntia, ir al inicio">
      <img src="/syntia-logo.png" alt="Syntia" className="marca-logo" />
      {sub && <small className="marca-sub">{sub}</small>}
    </Link>
  );
}

// Título de dos tonos: "Hola, Camila. Así están tus instalaciones."
export function Titulo({ fuerte, suave, nivel = 1 }: { fuerte: string; suave?: string; nivel?: 1 | 2 }) {
  const Tag = nivel === 1 ? 'h1' : 'h2';
  return (
    <Tag className={nivel === 1 ? 'titulo-grande' : 'titulo-medio'}>
      <strong>{fuerte}</strong>{suave && <> <span>{suave}</span></>}
    </Tag>
  );
}

export function Volver({ a, texto = 'Volver' }: { a?: string; texto?: string }) {
  const navegar = useNavigate();
  return a
    ? <Link to={a} className="volver"><ChevronLeft size={18} />{texto}</Link>
    : <button type="button" className="volver" onClick={() => navegar(-1)}><ChevronLeft size={18} />{texto}</button>;
}

type CampoProps = { etiqueta: string; ayuda?: ReactNode; error?: string; accion?: ReactNode };

// Campo con la etiqueta pequeña sobre el valor, como en los mockups
export function Campo({ etiqueta, ayuda, error, accion, ...input }: CampoProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`campo-flotante ${error ? 'con-error' : ''}`}>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} {...input} />
      {accion && <span className="campo-accion">{accion}</span>}
      {(error || ayuda) && <small className={error ? 'error' : ''}>{error || ayuda}</small>}
    </div>
  );
}

export function Selector({ etiqueta, ayuda, children, ...select }: CampoProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="campo-flotante">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} {...select}>{children}</select>
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

export function AreaTexto({ etiqueta, ayuda, ...area }: CampoProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="campo-flotante">
      <label htmlFor={id}>{etiqueta}</label>
      <textarea id={id} rows={3} {...area} />
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

export function CampoContrasena(props: Omit<CampoProps, 'accion'> & InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false);
  return (
    <Campo {...props} type={ver ? 'text' : 'password'}
      accion={<button type="button" className="enlace" onClick={() => setVer(!ver)}>{ver ? 'Ocultar' : 'Mostrar'}</button>} />
  );
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return <p className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export type Tono = 'buena' | 'mala' | 'alerta' | 'neutra' | 'info';
export function Etiqueta({ tono = 'neutra', punto, children }: { tono?: Tono; punto?: boolean; children: ReactNode }) {
  return <span className={`etiqueta ${tono}`}>{punto && <i className="punto" />}{children}</span>;
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="cargando"><Loader2 size={18} className="girar" />{texto}</p>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>;
}

export function Modal({ titulo, cerrar, children, ancho }: { titulo: string; cerrar: () => void; children: ReactNode; ancho?: number }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [cerrar]);
  return (
    <div className="modal-fondo" onMouseDown={cerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={ancho ? { maxWidth: ancho } : undefined}
        onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{titulo}</h2>
          <button type="button" className="icono-boton" onClick={cerrar} aria-label="Cerrar"><X size={20} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Pestanas<T extends string>({ opciones, valor, cambiar }: { opciones: [T, string, number?][]; valor: T; cambiar: (v: T) => void }) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map(([v, t, n]) => (
        <button key={v} type="button" role="tab" aria-selected={valor === v} className={valor === v ? 'activa' : ''} onClick={() => cambiar(v)}>
          {t}{n !== undefined && <span className="contador">{n}</span>}
        </button>
      ))}
    </div>
  );
}

// Tarjeta de indicador del inicio del administrador
export function Kpi({ titulo, valor, enlace, a, tono }: { titulo: string; valor: ReactNode; enlace?: string; a?: string; tono?: 'alerta' | 'mala' | 'destacada' }) {
  const contenido = (
    <>
      <span className="kpi-titulo">{tono === 'mala' || tono === 'alerta' ? <i className="punto" /> : null}{titulo}</span>
      <strong className="kpi-valor">{valor}</strong>
      {enlace && <span className="kpi-enlace">{enlace} ›</span>}
    </>
  );
  return a ? <Link to={a} className={`kpi ${tono ?? ''}`}>{contenido}</Link> : <div className={`kpi ${tono ?? ''}`}>{contenido}</div>;
}
