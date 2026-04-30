from utils.pdf_export import generate_pdf
try:
    generate_pdf({}, {})
    print("Success")
except Exception as e:
    import traceback
    traceback.print_exc()
