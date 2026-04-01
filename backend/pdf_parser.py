import sys
import json
import re
import traceback
import io

# Forzar salida en UTF-8 para evitar problemas de caracteres en el CRM
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    import pdfplumber
except ImportError:
    print(json.dumps({"error": "La librería pdfplumber no está instalada."}))
    sys.exit(1)

def parse_pdf(filepath):
    resultado = {
        "orden_cotizacion": "",
        "empresa": "",
        "persona": "",
        "sla": 10,
        "partidas": [],
        "tipo_servicio_global": "Calibración inLab" # default
    }
    
    texto_completo = ""
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    texto_completo += text + "\n"
    except Exception as e:
        print(json.dumps({"error": f"Error al abrir PDF: {str(e)}"}))
        sys.exit(1)
        
    # 1. Extraer Folio
    folio_match = re.search(r'(?:Cotizaci[oó]n\s+N[uú]mero|Orden de Servicio\s+No\.?|N[uú]mero)\s*:?\s*([A-Z0-9]+-\d+)', texto_completo, re.IGNORECASE)
    if folio_match:
        resultado["orden_cotizacion"] = folio_match.group(1).strip()
        
    # 2. SLA
    sla_match = re.search(r'Tiempo de entrega d[ií]as h[aá]biles:\s*(?:\d+\s*a\s*)?(\d+)', texto_completo, re.IGNORECASE)
    if sla_match:
        resultado["sla"] = int(sla_match.group(1))

    # 2.b Extraer Tipo de Servicio Global
    tipo_srv_match = re.search(r'Tipo de servicio\s*[:]\s*([^\n]+)', texto_completo, re.IGNORECASE)
    if tipo_srv_match:
        raw_srv = tipo_srv_match.group(1).strip().lower()
        if 'venta' in raw_srv:
            resultado["tipo_servicio_global"] = "Venta"
        elif 'calibraci' in raw_srv:
            # Default a inLab, pero podrías buscar "plant" o "lab"
            resultado["tipo_servicio_global"] = "Calibración inLab"
        elif 'medici' in raw_srv:
            resultado["tipo_servicio_global"] = "Medición"
        elif 'ensayo' in raw_srv:
            resultado["tipo_servicio_global"] = "Ensayos de Aptitud"
        elif 'consult' in raw_srv:
            resultado["tipo_servicio_global"] = "Consultoría"
        elif 'capacit' in raw_srv:
            resultado["tipo_servicio_global"] = "Capacitación"
        elif 'calific' in raw_srv:
            resultado["tipo_servicio_global"] = "Calificación"
        
    # 3. Empresa y Contacto
    email_regex = r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
    lineas = texto_completo.split('\n')
    for i, lin in enumerate(lineas):
        if re.search(email_regex, lin):
            match_persona = re.match(r'^(.*?)(?:<|/|\s+[a-zA-Z0-9._%+-]+@)', lin)
            if match_persona:
                resultado["persona"] = re.sub(r'SR\.\s*', '', match_persona.group(1), flags=re.IGNORECASE).replace(',', '').strip()
            else:
                resultado["persona"] = re.sub(email_regex, '', lin).replace('<', '').replace('>', '').replace('/', '').replace(',', '').strip()
            
            if i > 0:
                empresa = lineas[i - 1].replace('"', '').replace("'", '').strip()
                if re.search(r'(fecha|número|vencimiento|cotización)', empresa, re.IGNORECASE) and i > 1:
                    empresa = lineas[i - 2].replace('"', '').replace("'", '').strip()
                resultado["empresa"] = empresa
            break

    # 4. Extraer Partidas
    idx_corte = texto_completo.lower().find("condiciones generales")
    if idx_corte != -1:
        texto_util = texto_completo[:idx_corte]
    else:
        texto_util = texto_completo
        
    # Romper el texto donde encuentre una clave (ej. HTHT18) al inicio de una linea
    bloques = re.split(r'\n(?=[A-Z]{3,6}\d{2,3}[\s-]+)', '\n' + texto_util)
    
    partidas = []
    for bloque in bloques:
        bloque = bloque.strip()
        if not bloque: continue
        if not re.match(r'^[A-Z]{3,6}\d{2,3}', bloque):
            continue
            
        lineas_bloque = bloque.split('\n')
        linea_nombre = lineas_bloque[0]
        
        # limpiar clave del inicio y precios del final
        nombre_limpio = re.sub(r'^[A-Z]{3,6}\d{2,3}[\w-]*\s+', '', linea_nombre).strip()
        nombre_limpio = re.sub(r'(\s*[,]?\s*[\d\.,]+\s*[,]?\s*\d+\s*[,]?\s*[\d\.,]+)\s*$', '', nombre_limpio)
        nombre_limpio = re.sub(r'(\s*[,]?\s*[\d\.,]+)\s*$', '', nombre_limpio).strip()
        
        if not nombre_limpio and len(lineas_bloque) > 1:
            nombre_limpio = lineas_bloque[1].strip()
            
        partida = {
            "nombre_instrumento": nombre_limpio if nombre_limpio else "Instrumento de Medición",
            "marca": "No Indicada",
            "modelo": "No Indicado",
            "no_serie": "No Indicado",
            "tipo_servicio": resultado["tipo_servicio_global"]
        }
        
        bloque_flat = " ".join(lineas_bloque)
        
        marca_match = re.search(r'Marca:\s*(.*?)(?=\s*(Modelo|No\.\s*de\s*serie|Identificación|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if marca_match: partida["marca"] = marca_match.group(1).strip()
        
        modelo_match = re.search(r'Modelo:\s*(.*?)(?=\s*(Marca|No\.\s*de\s*serie|Identificación|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if modelo_match: partida["modelo"] = modelo_match.group(1).strip()
        
        serie_match = re.search(r'(?:No\.\s*(?:de\s*)?serie|Serie):\s*(.*?)(?=\s*(Marca|Modelo|Identificación|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if serie_match and serie_match.group(1):
            partida["no_serie"] = serie_match.group(1).strip()
        
        partidas.append(partida)
        
    for p in partidas:
        for campo in ["marca", "modelo", "no_serie"]:
            if not p[campo] or re.search(r'no indicad', p[campo], re.IGNORECASE):
                p[campo] = 'No Indicado' if campo != 'marca' else 'No Indicada'

    filtros_basura = ['viático', 'viatico', 'certificado', 'envío', 'recolección', 'cargo por servicio', 'mensajería', 'retorno de', 'mensajeria']
    resultado["partidas"] = [p for p in partidas if not any(f in p["nombre_instrumento"].lower() for f in filtros_basura)]

    # Final output
    print(json.dumps(resultado, ensure_ascii=False))

if __name__ == "__main__":
    try:
        if len(sys.argv) > 1:
            parse_pdf(sys.argv[1])
        else:
            print(json.dumps({"error": "No se proporcionó archivo PDF"}))
    except Exception as e:
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
