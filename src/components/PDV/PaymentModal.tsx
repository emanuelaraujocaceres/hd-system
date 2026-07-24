// Trecho atualizado na função handleFinalizeSale (por volta da linha 170):
const saleData: Sale = {
  id: `sale-${Date.now()}`,
  code: `VND-${Math.floor(1000 + Math.random() * 9000)}`,
  date: new Date().toISOString(),
  items: cart,
  subtotal,
  discount,
  total: totalAmount,
  payments,
  status: 'completed',
};

// Salva no storage e limpa o carrinho
saveSale(saleData);
