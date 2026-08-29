import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  // stub de canvas 2d + toDataURL
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() }) as any;
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
  it('captura uma página e reporta via onCaptured ao concluir', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    const onCaptured = vi.fn();
    renderModal({ onCaptured });

    const captureBtn = await screen.findByRole('button', { name: /Capturar página/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());

    fireEvent.click(captureBtn);
    expect(await screen.findByText(/Páginas capturadas: 1/)).toBeTruthy();
    expect(screen.getByAltText('Página 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Concluir/ }));
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured.mock.calls[0][0]).toHaveLength(1);
    expect(onCaptured.mock.calls[0][1]).toBe('danfe');
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

  it('remove uma página capturada', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    renderModal({ onCaptured: vi.fn() });

    const captureBtn = await screen.findByRole('button', { name: /Capturar página/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());
    fireEvent.click(captureBtn);
    expect(await screen.findByText(/Páginas capturadas: 1/)).toBeTruthy();

    fireEvent.click(screen.getByTitle('Remover página'));
    await waitFor(() => expect(screen.queryByText(/Páginas capturadas: 1/)).toBeNull());
  });

  it('não inicia captura sem stream (botão desabilitado)', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    renderModal({ onCaptured: vi.fn() });
    // Antes da câmera ligar, o botão deve estar desabilitado
    expect(screen.getByRole('button', { name: /Capturar página/ })).toBeDisabled();
  });

  it('lê a chave de acesso via QR Code e a repassa no onCaptured', async () => {
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

    const captureBtn = await screen.findByRole('button', { name: /Capturar página/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());

    const qrBtn = await screen.findByRole('button', { name: /Ler QR Code/ });
    fireEvent.click(qrBtn);
    await waitFor(() => expect(screen.getByText(/Chave lida/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Concluir/ }));
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured.mock.calls[0][2]).toBe('12345678901234567890123456789012345678901234');
  });

  it('ignora página duplicada (dedupe por imagem idêntica)', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream));
    // toDataURL retorna valor constante no beforeEach -> capturas idênticas
    renderModal({ onCaptured: vi.fn() });
    const captureBtn = await screen.findByRole('button', { name: /Capturar página/ });
    await waitFor(() => expect(captureBtn).not.toBeDisabled());
    fireEvent.click(captureBtn);
    fireEvent.click(captureBtn);
    expect(await screen.findByText(/Páginas capturadas: 1/)).toBeTruthy();
  });
});
