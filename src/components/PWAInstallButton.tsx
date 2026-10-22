import '../preamble';
import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar App</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Smartphone className="w-4 h-4 shrink-0 text-emerald-600" />
        <span>{isIOS ? 'Instalar en iOS' : 'Instalar PWA'}</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Instalar MercApp Casa en tu dispositivo
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Cerrar guía de instalación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
              {isIOS ? (
                <>
                  <p>Para instalar la aplicación en tu iPhone o iPad desde Safari:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-800 font-medium">
                    <li>Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.</li>
                    <li>Desliza hacia abajo y selecciona <strong>Agregar a pantalla de inicio</strong>.</li>
                    <li>Confirma tocando <strong>Agregar</strong> en la esquina superior derecha.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>
                    MercApp Casa está configurada como una Progressive Web App (PWA) con soporte offline.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-800 font-medium">
                    <li>Abre la aplicación en una pestaña directa del navegador (fuera de vista previa).</li>
                    <li>Haz clic en el ícono <strong>Instalar MercApp Casa</strong> en la barra de direcciones de Chrome o Edge.</li>
                    <li>En Android, abre el menú del navegador y elige <strong>Instalar aplicación</strong>.</li>
                  </ol>
                </>
              )}
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo sin conexión · Usando datos en caché</span>
    </div>
  );
};
