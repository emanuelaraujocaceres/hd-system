const tlv = (id: string, value: string) => `${id}${value.length.toString().padStart(2, '0')}${value}`;

const normalize = (value: string, maxLength: number) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9 $%*+\-./:]/g, '')
  .toUpperCase()
  .slice(0, maxLength);

export function crc16Ccitt(value: string): string {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Creates a static Pix BR Code. It embeds the amount but does not confirm payment. */
export function buildPixBrCode(key: string, amount: number, receiverName: string, city: string): string {
  const pixKey = key.trim();
  if (!pixKey) throw new Error('Chave Pix é obrigatória.');
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey);
  const payload = [
    tlv('00', '01'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    ...(amount > 0 ? [tlv('54', amount.toFixed(2))] : []),
    tlv('58', 'BR'),
    tlv('59', normalize(receiverName || 'RECEBEDOR', 25)),
    tlv('60', normalize(city || 'SAO PAULO', 15)),
    tlv('62', tlv('05', '***')),
  ].join('');
  return `${payload}6304${crc16Ccitt(`${payload}6304`)}`;
}
