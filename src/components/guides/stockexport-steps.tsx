import type { BrokerGuide } from './types';

const NBSP = '\u00a0';

export const stockexportGuide: BrokerGuide = {
  brokerId: 'stockexport',
  brokerName: 'Microsoft StockExport',
  steps: [
    {
      title: 'Télécharger le StockExport',
      description: (
        <>
          Connectez-vous au portail Microsoft Total Rewards via{' '}
          <a
            href="https://aka.ms/stock"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            aka.ms/stock
          </a>
          , ouvrez l'onglet <strong>Stock</strong>, puis cliquez sur l'icône Excel à droite de{' '}
          <strong>«{NBSP}Download stock details (Excel){NBSP}»</strong> dans l'encadré{' '}
          <em>Personal details</em>.
        </>
      ),
      image: '/tutorial/stockexport/step-1.png',
      imageAlt: 'Portail Microsoft Total Rewards — bouton de téléchargement du StockExport',
    },
  ],
};
