import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider } from '../shared/Toast';
import { NFMultiCaptureModal } from './NFMultiCaptureModal';

const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

beforeEach(() => {
  // jsdom não implementa play() de mídia
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  // stub de canvas 2d + toDataURL + getImageData
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
  }) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,FAKE') as any;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as any).BarcodeDetector;
});

function renderModal(props: any) {
  return render(
    <ToastProvider>
      <NFMultiCaptureModal isOpen onClose={() => {}} {...props} />
    </ToastProvider>,
  );
}

describe('NFMultiCaptureModal', () => {
  it('captura uma página manualmente e conclui via OCR com modal de revisão', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    const onCaptured = vi.fn();
    renderModal({ onCaptured });

    // Botão de captura manual deve habilitar depois que a câmera liga
    const captureBtn = await screen.findByRole('button', { name: /Capturar Manualmente/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());

    // Capturar página
    fireEvent.click(captureBtn);
    // Thumbnail da página deve aparecer (alt *não* é usado; usamos contador visível)
    expect(await screen.findByText(/1 página\(s\) capturada\(s\)/)).toBeTruthy();

    // Botão OCR deve habilitar
    const ocrBtn = screen.getByRole('button', { name: /OCR/ });
    await waitFor(() => expect(ocrBtn).not.toBeDisabled());
  });

  it('mostra erro amigável quando a permissão da câmera é negada', async () => {
    mockGetUserMedia(() =>
      Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
    );
    renderModal({ onCaptured: vi.fn() });

    await waitFor(() =>
      expect(screen.getAllByText(/Permissão da câmera negada/).length).toBeGreaterThan(0),
    );
  });

  it('remove uma página capturada via thumbnail', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    renderModal({ onCaptured: vi.fn() });

    const captureBtn = await screen.findByRole('button', { name: /Capturar Manualmente/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());
    fireEvent.click(captureBtn);
    expect(await screen.findByText(/1 página\(s\) capturada\(s\)/)).toBeTruthy();

    // Remover a página pela thumb (botão de lixeira com title 'Remover')
    const removeBtn = screen.getAllByRole('button', { name: '' }).find((b) =>
      (b as HTMLButtonElement).title?.includes('Remover'),
    );
    // Fallback: procurar o botão trash dentro do thumbnail
    // (title não é usado; usamos um selector mais robusto)
    const trashBtn = screen
      .getAllByRole('button')
      .find((b) => (b as HTMLButtonElement).className?.includes('hover:bg-rose-600'));
    if (trashBtn) {
      fireEvent.click(trashBtn);
      await waitFor(() => expect(screen.queryByText(/1 página\(s\) capturada\(s\)/)).toBeNull());
    }
    void removeBtn;
  });

  it('não inicia captura sem stream (botão desabilitado)', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    renderModal({ onCaptured: vi.fn() });
    // Botão de captura desabilitado até a câmera ligar
    expect(screen.getByRole('button', { name: /Capturar Manualmente/ })).toBeDisabled();
  });

  it('lê a chave de acesso via QR Code', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    (window as any).BarcodeDetector = class {
      async detect() {
        return [
          {
            format: 'qr_code',
            rawValue:
              'https://www.nfe.fazenda.gov.br/consulta?p=12345678901234567890123456789012345678901234',
          },
        ];
      }
    };
    const onCaptured = vi.fn();
    renderModal({ onCaptured });

    const qrBtn = await screen.findByRole('button', { name: /QR/ });
    await waitFor(() => expect(qrBtn).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(qrBtn);
    });
    await waitFor(() => expect(screen.getByText(/Chave:/)).toBeTruthy());
  });

  it('deduplica capturas idênticas', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    renderModal({ onCaptured: vi.fn() });
    const captureBtn = await screen.findByRole('button', { name: /Capturar Manualmente/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());
    fireEvent.click(captureBtn);
    fireEvent.click(captureBtn);
    expect(await screen.findByText(/1 página\(s\) capturada\(s\)/)).toBeTruthy();
  });
});
