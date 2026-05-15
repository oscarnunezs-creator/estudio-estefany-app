
import pdfplumber

pdf_path = r"C:\Users\oscar\OneDrive\Escritorio\Nueva carpeta\Business documents and policies\TIPOS DE GASTOS PARA ESTUDIO ESTEFANY BY LASHES.pdf"

with pdfplumber.open(pdf_path) as pdf:
    text = ""
    for page in pdf.pages:
        text += page.extract_text() + "\n"

print(text)
