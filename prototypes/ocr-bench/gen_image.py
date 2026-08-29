from PIL import Image, ImageDraw, ImageFont

W, H = 900, 1200
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

try:
    font = ImageFont.truetype("arial.ttf", 26)
    small = ImageFont.truetype("arial.ttf", 20)
except Exception:
    font = ImageFont.load_default()
    small = font

lines = [
    "DANFE",
    "DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA",
    "RAZAO SOCIAL: BEBIDAS EXEMPLO LTDA",
    "CNPJ: 12.345.678/0001-90",
    "NUMERO: 000123456",
    "",
    "PRODUTO                           QTD   VL UNIT   VL TOTAL",
    "1 REFRIGERANTE COCA COLA 2L        12     6,00       72,00",
    "2 CERVEJA SKOL 350ML               24     2,50       60,00",
    "3 SNICKERS 40G                     10     3,20       32,00",
    "",
    "VALOR TOTAL DA NOTA FISCAL:       164,00",
]

y = 40
for ln in lines:
    d.text((40, y), ln, fill="black", font=font if ln else font)
    y += 46 if ln else 30

img.save("sample_danfe.png")
print("imagem gerada: sample_danfe.png")
