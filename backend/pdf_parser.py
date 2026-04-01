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
        "cabecera": {
            "orden_cotizacion": "",
            "empresa": "",
            "persona": "",
            "sla": 10
        },
        "partidas": []
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
        
    # 1. Extraer Folio (Cabecera) - Patrones Directos
    folio_match = re.search(r'(?:Ref\s*/\s*Orden|Referencia|Cotizaci[oó]n\s+N[uú]mero|Orden de Servicio\s+No\.?|N[uú]mero)\s*:?\s*([A-Z0-9-]+)', texto_completo, re.IGNORECASE)
    if folio_match:
        resultado["cabecera"]["orden_cotizacion"] = folio_match.group(1).strip()
        
    # 2. SLA (Cabecera)
    # Patrón 1: SLA (Días) 🟢 Normal (10 días)
    sla_match = re.search(r'SLA\s*\(D[ií]as\)\s*.*\((\d+)\s*d[ií]as\)', texto_completo, re.IGNORECASE)
    if sla_match:
        resultado["cabecera"]["sla"] = int(sla_match.group(1))
    else:
        # Patrón 2: Tiempo de entrega días hábiles: 10
        sla_match2 = re.search(r'(?:Tiempo|Plazo) de entrega(?:\s*d[ií]as h[aá]biles)?:\s*(?:\d+\s*a\s*)?(\d+)', texto_completo, re.IGNORECASE)
        if sla_match2:
            resultado["cabecera"]["sla"] = int(sla_match2.group(1))

    # 3. Datos de Cabecera (Empresa, Contacto, Email)
    email_regex = r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
    email_found = re.search(email_regex, texto_completo)
    
    if email_found:
        # El usuario menciona: Daniel Ortiz Domiguez / dortiz@capymet.com
        # Buscamos la línea donde aparece el correo
        idx_email = texto_completo.find(email_found.group(1))
        # Capturamos el texto antes del correo en esa misma zona (línea)
        inicio_linea = texto_completo.rfind('\n', 0, idx_email)
        linea_contacto = texto_completo[inicio_linea+1 : idx_email+len(email_found.group(1))]
        
        # Limpiar: Daniel Ortiz Domiguez / dortiz@capymet.com -> Daniel Ortiz Domiguez / dortiz@capymet.com
        # Pero si el usuario quiere "Daniel Ortiz Domiguez / email", capturamos todo
        resultado["cabecera"]["persona"] = linea_contacto.strip().replace('<', '').replace('>', '').replace('/', ' / ')

        # La empresa suele estar arriba del contacto/correo
        lineas = texto_completo[:inicio_linea].split('\n')
        for i in range(len(lineas)-1, -1, -1):
            potencial = lineas[i].strip()
            if potencial and len(potencial) > 3 and not re.search(r'(fecha|número|cotización|vencimiento|página|hoja|ref)', potencial, re.IGNORECASE):
                resultado["cabecera"]["empresa"] = potencial
                break

    # Refuerzo por Palabras Clave (si lo anterior falló o para Empresa)
    if not resultado["cabecera"]["empresa"]:
        emp_match = re.search(r'Empresa\s*:?\s*\n?\s*(.*?)(?=\n|Contacto|Ref|SLA|$)', texto_completo, re.IGNORECASE)
        if emp_match: resultado["cabecera"]["empresa"] = emp_match.group(1).strip()
    
    # Si detectó basura en Contacto (ej: "del cliente...") se busca por palabra clave
    if not resultado["cabecera"]["persona"] or "del cliente" in resultado["cabecera"]["persona"].lower():
        cont_match = re.search(r'Contacto\s*:?\s*\n?\s*(.*?)(?=\n|Empresa|Ref|SLA|$)', texto_completo, re.IGNORECASE)
        if cont_match and len(cont_match.group(1)) > 3:
            resultado["cabecera"]["persona"] = cont_match.group(1).strip()

    # 4. Extraer Partidas (Nivel 2)
    idx_corte = texto_completo.lower().find("condiciones generales")
    texto_util = texto_completo[:idx_corte] if idx_corte != -1 else texto_completo
        
    # Romper el texto donde encuentre una clave (ej. HTHT18 o PRMB01) al inicio de una linea
    bloques = re.split(r'\n(?=[A-Z]{3,6}\d{2,4}[\s-]+)', '\n' + texto_util)
    
    for bloque in bloques:
        bloque = bloque.strip()
        if not bloque or not re.match(r'^[A-Z]{3,6}\d{2,4}', bloque):
            continue
            
        lineas_bloque = bloque.split('\n')
        linea_nombre = lineas_bloque[0]
        
        # Limpiar clave del inicio y precios del final
        nombre_limpio = re.sub(r'^[A-Z]{3,6}\d{2,4}[\w-]*\s+', '', linea_nombre).strip()
        nombre_limpio = re.sub(r'(\s*[,]?\s*[\d\.,]+\s*[,]?\s*\d+\s*[,]?\s*[\d\.,]+)\s*$', '', nombre_limpio)
        nombre_limpio = re.sub(r'(\s*[,]?\s*[\d\.,]+)\s*$', '', nombre_limpio).strip()
        
        if not nombre_limpio and len(lineas_bloque) > 1:
            nombre_limpio = lineas_bloque[1].strip()
            
        partida = {
            "nombre_instrumento": nombre_limpio if nombre_limpio else "Instrumento de Medición",
            "marca": "No Indicada",
            "modelo": "No Indicado",
            "no_serie": "No Indicado",
            "identificacion": "No Indicada",
            "ubicacion": "No Indicada",
            "requerimientos_especiales": "No requeridos",
            "puntos_calibrar": "No especificados",
            "tipo_servicio": "Calibración inLab"
        }
        
        bloque_flat = " ".join(lineas_bloque)
        
        # --- EXTRACCIÓN NIVEL 2 ---
        
        # Marca
        marca_match = re.search(r'Marca:\s*(.*?)(?=\s*(Modelo|No\.|No\s*de\s*serie|Identificación|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if marca_match: partida["marca"] = marca_match.group(1).strip()
        
        # Modelo
        modelo_match = re.search(r'Modelo:\s*(.*?)(?=\s*(Marca|No\.|No\s*de\s*serie|Identificación|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if modelo_match: partida["modelo"] = modelo_match.group(1).strip()
        
        # No. Serie
        serie_match = re.search(r'(?:No\.\s*(?:de\s*)?serie|Serie):\s*(.*?)(?=\s*(Marca|Modelo|Identificación|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if serie_match and serie_match.group(1):
            partida["no_serie"] = serie_match.group(1).strip()

        # Identificación
        ident_match = re.search(r'(?:Identificación|ID):\s*(.*?)(?=\s*(Marca|Modelo|No\.|Ubicación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if ident_match: partida["identificacion"] = ident_match.group(1).strip()

        # Ubicación
        ubic_match = re.search(r'Ubicación:\s*(.*?)(?=\s*(Marca|Modelo|No\.|Identificación|Requerimientos|Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if ubic_match: partida["ubicacion"] = ubic_match.group(1).strip()

        # Requerimientos Especiales
        reqs_match = re.search(r'Requerimientos especiales:\s*(.*?)(?=\s*(Tiempo|Intervalo|Método|$))', bloque_flat, re.IGNORECASE)
        if reqs_match: partida["requerimientos_especiales"] = reqs_match.group(1).strip()

        # Puntos a Calibrar (Heurística: buscar la frase que empieza por Calibración en...)
        puntos_match = re.search(r'(Calibración en\s*.*?\.)', bloque_flat, re.IGNORECASE)
        if puntos_match:
            partida["puntos_calibrar"] = puntos_match.group(1).strip()
        
        # Tipo de Servicio Detallado
        # Si el bloque contiene la descripción del método, la guardamos
        tipo_match = re.search(r'(Calibración por\s*.*?\.)', bloque_flat, re.IGNORECASE)
        if tipo_match:
            partida["tipo_servicio"] = tipo_match.group(1).strip()
        
        resultado["partidas"].append(partida)
        
    # Limpieza final de campos vacíos o "No indicados"
    for p in resultado["partidas"]:
        for campo in ["marca", "modelo", "no_serie", "identificacion", "ubicacion"]:
            if not p[campo] or re.search(r'no indicad', p[campo], re.IGNORECASE) or p[campo] == '...':
                p[campo] = 'No Indicado' if campo != 'marca' and campo != 'identificacion' and campo != 'ubicacion' else 'No Indicada'

    filtros_basura = ['viático', 'viatico', 'certificado', 'envío', 'recolección', 'cargo por servicio', 'mensajería', 'retorno de']
    resultado["partidas"] = [p for p in resultado["partidas"] if not any(f in p["nombre_instrumento"].lower() for f in filtros_basura)]

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
