
import pdfplumber

pdf_path = r"C:\Users\oscar\OneDrive\Escritorio\Nueva carpeta\Business documents and policies\TIPOS DE GASTOS PARA ESTUDIO ESTEFANY BY LASHES.pdf"
output_path = r"c:\Users\oscar\OneDrive\Escritorio\Nueva carpeta\estefany-web\scratch\expenses_text.txt"

with pdfplumber.open(pdf_path) as pdf:
    with open(output_path, "w", encoding="utf-8") as f:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            f.write(f"--- PAGE {i+1} ---\n")
            f.write(text + "\n\n")
