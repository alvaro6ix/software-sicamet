import sys, json, re, traceback, io

if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    import pdfplumber
except ImportError:
    print(json.dumps({"error": "pdfplumber no instalado"})); sys.exit(1)

CERT_PATTERN = r'IC[A-Z]{1,4}\.[0-9]{3,5}\.[0-9]{2}'
FOOTER_RE = [
    r'Sistemas Integrales de Calibración', r'Juan Aldama Sur', r'\(722\)\s*\d+',
    r'www\.sicamet', r'sclientes@sicamet', r'^Página \d+ de \d+', r'^PEO\.', r'^FE \d+',
]

def _texto(fp):
    t = ""
    with pdfplumber.open(fp) as pdf:
        for p in pdf.pages:
            x = p.extract_text()
            if x: t += x + "\n"
    return t

def _pag1(fp):
    with pdfplumber.open(fp) as pdf:
        return (pdf.pages[0].extract_text() or "") if pdf.pages else ""

def _fix_font(s):
    """Repara artefactos de fuente PDF: 'd e' -> 'de', 'N o' -> 'No', 'Ind icado' -> 'Indicado'"""
    if not s: return s
    # Casos específicos de palabras cortas rotas
    s = re.sub(r'\bd\s+e\b', 'de', s)
    s = re.sub(r'\bN\s+o\b', 'No', s)
    s = re.sub(r'ó\s+n', 'ón', s)
    s = re.sub(r'ó\s+s', 'ós', s)
    s = re.sub(r'é\s+n', 'én', s)
    s = re.sub(r'a\s+n', 'an', s)
    return s

def _fix_font_field(s):
    """Fix font artifacts para valores de campos individuales"""
    if not s: return s
    s = _fix_font(s)
    # No unir si es el default 'No Indicado'
    if re.match(r'^No\s+Indicado$', s, re.IGNORECASE):
        return 'No Indicado'
    # Solo unir fragmentos donde la segunda parte NO empieza con mayúscula
    # Esto preserva 'Palabra Palabra' pero une 'Ind icado' -> 'Indicado'
    s = re.sub(r'(?<=[A-Za-zÁÉÍÓÚáéíóúÑñ]{2}) (?=[a-záéíóúñ]{2})', '', s)
    return s

def _clean(v, d="No Indicado"):
    if not v: return d
    v = re.sub(r'\s{2,}', ' ', str(v).strip())
    return v or d

def _no_footer(t):
    return '\n'.join(l for l in t.split('\n')
                     if not any(re.search(p, l, re.IGNORECASE) for p in FOOTER_RE))

# ── construir partida ─────────────────────────────────────────────────────────
def _partida(clave, nombre, cert, flat):
    p = {
        "clave": _clean(clave), "nombre_instrumento": _clean(nombre, "Instrumento de Medición"),
        "no_certificado": _clean(cert, ""), "marca": "No Indicada", "modelo": "No Indicado",
        "no_serie": "No Indicado", "identificacion": "No Indicada", "ubicacion": "No Indicada",
        "intervalo_calibracion": "No especificado", "requerimientos_especiales": "No requeridos",
        "tipo_servicio": "Calibración",
    }
    def g(pat): m = re.search(pat, flat, re.IGNORECASE); return _clean(m.group(1)) if m else None
    v = g(r'Marca\s*:\s*(.+?)(?=\s+Modelo\s*:)')
    if v: p["marca"] = v
    v = g(r'Modelo\s*:\s*(.+?)(?=\s+No\.\s*(?:de\s*)?serie\s*:)')
    if v: p["modelo"] = v
    v = g(r'No\.\s*(?:de\s*)?serie\s*:\s*(.+?)(?=\s+Identificaci[oó]n\s*:)')
    if not v: v = g(r'N[°o]\s*serie\s*:\s*(.+?)(?=\s+Identificaci[oó]n\s*:|$)')
    if v: p["no_serie"] = v
    v = g(r'Identificaci[oó]n\s*:\s*(.+?)(?=\s+Ubicaci[oó]n\s*:)')
    if v: p["identificacion"] = v
    v = g(r'Ubicaci[oó]n\s*:\s*(.+?)(?=\s+Intervalo\s+de\s+calibraci[oó]n\s*:|$)')
    if v: p["ubicacion"] = v
    v = g(r'Intervalo\s+de\s+calibraci[oó]n\s*:\s*(.+?)(?=\s+Requerimientos|$)')
    if v:
        # Limpiar ruido de encabezado de página repetido al final del último ítem
        noise = re.search(r'\s+(?:Orden de Servicio|N[uú]mero:|Nombre del Cliente|Clave\s+Descripci)', v, re.IGNORECASE)
        if noise: v = v[:noise.start()].strip()
        # Cortar antes de "Estado físico" (texto adicional que no es parte del intervalo)
        ef = re.search(r'\s+Estado\s+f[íi]sico', v, re.IGNORECASE)
        if ef: v = v[:ef.start()].strip()
        p["intervalo_calibracion"] = v
    v = g(r'Requerimientos\s+especiales\s*:\s*(.+?)(?=\s+Tiempo|$)')
    if v: p["requerimientos_especiales"] = v
    if re.search(r'in[- ]?situ', flat, re.IGNORECASE):
        p["tipo_servicio"] = "Calibración In-Situ"
    return p

# ── extraer partidas ──────────────────────────────────────────────────────────
def _partidas(texto):
    """Extrae partidas de orden de servicio.
    Detecta TODAS las entradas (con o sin No. de Certificado) buscando
    líneas que empiecen con patrón de clave (3-6 mayúsculas + 2-4 dígitos)."""
    KEY_RE = r'^([A-Z]{3,6}\d{2,4})\s+(.+)$'
    searchable = '\n' + texto
    lineas = searchable.split('\n')

    # Encontrar índices de líneas que son inicio de partida
    starts = []
    for i, linea in enumerate(lineas):
        m = re.match(KEY_RE, linea.strip(), re.IGNORECASE)
        if m:
            starts.append((i, m.group(1).strip(), m.group(2).strip()))

    if not starts:
        return []

    out = []
    for idx, (line_idx, clave, resto) in enumerate(starts):
        # Buscar cert en la línea principal (soporta múltiples separados por /)
        # Buscamos una secuencia de uno o más certificados con posibles separadores como '/'
        certm = re.search(r'((?:' + CERT_PATTERN + r'(?:\s*/\s*)?)+)\s*$', resto, re.IGNORECASE)
        cert = certm.group(1).strip() if certm else ""
        nombre = resto[:certm.start()].strip() if certm else resto.strip()

        # Si no hay cert, buscar en el bloque
        next_line_idx = starts[idx+1][0] if idx+1 < len(starts) else len(lineas)
        bloque = '\n'.join(lineas[line_idx+1:next_line_idx])
        flat = ' '.join(_no_footer(bloque).split())

        if not cert:
            cm2 = re.search(CERT_PATTERN, flat, re.IGNORECASE)
            if cm2: cert = cm2.group(0)

        out.append(_partida(clave, nombre, cert, flat))

    basura = ['viático','viatico','envío','recolección','cargo por servicio','mensajería','retorno de','certificado digital']
    return [p for p in out if not any(b in p["nombre_instrumento"].lower() for b in basura)]

# ── PARSE ORDEN ───────────────────────────────────────────────────────────────
def parse_orden(fp):
    cab = {
        "orden_numero":"","cotizacion_referencia":"","fecha_recepcion":"",
        "servicio_solicitado":"","empresa":"","contacto_nombre":"","contacto_email":"",
        "nombre_certificados":"","direccion":"",
        "sla":None,"area_laboratorio":None,"responsables":[]
    }
    texto = _no_footer(_texto(fp))

    def s(pat, flags=re.IGNORECASE): return re.search(pat, texto, flags)

    m = s(r'N[uú]mero\s*:\s*([A-Z0-9-]+)')
    if m: cab["orden_numero"] = m.group(1).strip()
    m = s(r'Cotizaci[oó]n\s+de\s+Referencia\s*:\s*([A-Z0-9-]+)')
    if m: cab["cotizacion_referencia"] = m.group(1).strip()
    m = s(r'Fecha\s+de\s+recepci[oó]n\s*:\s*([\d\./-]+)')
    if m: cab["fecha_recepcion"] = m.group(1).strip()
    m = s(r'Servicio\s+solicitado\s*:\s*(.+?)(?=\n|$)')
    if m: cab["servicio_solicitado"] = m.group(1).strip()

    # ── EXTRACCIÓN DE EMPRESA Y CONTACTO (formatos múltiples) ──

    # Formato 1: EMPRESA Nombre Contacto <email> (con angle brackets)
    m = re.search(
        r'([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\.,\-]{2,}?)\s+'
        r'([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+){1,4})'
        r'\s*<([^>]+@[^>]+)>',
        texto, re.MULTILINE
    )
    if m:
        cab["empresa"]         = _clean(m.group(1))
        cab["contacto_nombre"] = _clean(m.group(2))
        cab["contacto_email"]  = _clean(m.group(3))
    else:
        # Formato 2: "EMPRESA Nombre Apellido / email@dominio.com" (sin angle brackets)
        m2 = re.search(
            r'([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\.\s]{1,20}?)\s+'
            r'([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)+)\s*/\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
            texto, re.MULTILINE
        )
        if m2:
            cab["empresa"]         = _clean(m2.group(1))
            cab["contacto_nombre"] = _clean(m2.group(2))
            cab["contacto_email"]  = _clean(m2.group(3))
        else:
            # Fallback: solo email
            em = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', texto)
            if em: cab["contacto_email"] = em.group(1).strip()

    # Contacto (después de "Contacto:")
    if not cab["contacto_nombre"]:
        mc = s(r'Contacto\s*:\s*\n?\s*(.+?)(?=\n|$)')
        if mc:
            val = mc.group(1).strip()
            # Si contiene email, limpiarlo
            val = re.sub(r'\s*/\s*.*', '', val).strip()
            if val and len(val) > 2:
                cab["contacto_nombre"] = _clean(val)

    m = s(r'Generar\s+Certificados.*?Nombre\s*:\s*(.+?)(?=\n)', re.IGNORECASE | re.DOTALL)
    if m: cab["nombre_certificados"] = _clean(m.group(1))

    # ── DIRECCIÓN (múltiples formatos) ──
    # Formato: "Dirección: Alfareros No. 45\nCol. San Mateo..."
    m = s(r'Direcci[oó]n\s*:\s*\n?\s*(.+?)\n(.+?)(?=\n[A-Z])', re.IGNORECASE | re.DOTALL)
    if m:
        linea1 = m.group(1).strip()
        linea2 = m.group(2).strip()
        cab["direccion"] = f"{linea1}, {linea2}"
    else:
        m = s(r'Direcci[oó]n\s*:\s*\n?\s*(.+?)(?=\n)', re.IGNORECASE | re.DOTALL)
        if m: cab["direccion"] = _clean(m.group(1))

    # Cortar antes de sección de firmas/comentarios
    texto_util = texto
    for pc in [r'Comentarios o eventos relevantes', r'Acepto las condiciones', r'condiciones generales']:
        mc = re.search(pc, texto_util, re.IGNORECASE)
        if mc: texto_util = texto_util[:mc.start()]; break

    res = {"tipo":"orden","cabecera":cab,"partidas":_partidas(texto_util)}
    print(json.dumps(res, ensure_ascii=False, indent=2))

# ── PARSE CERTIFICADO ─────────────────────────────────────────────────────────
def parse_certificado(fp):
    res = {"tipo":"certificado","datos":{
        "no_certificado":"","orden_servicio":"","cliente":"",
        "instrumento":"","marca":"","modelo":"","serie":"","identificacion":""
    }}
    texto = _pag1(fp)
    # Aplicar fix de fuente a TODO el texto antes de buscar
    texto = _fix_font(texto)

    m = re.search(r'(?:No\.\s*de\s*Certificado|Certificate\s*number)\s*[:\s]*\n?\s*(' + CERT_PATTERN + r')', texto, re.IGNORECASE)
    if m: res["datos"]["no_certificado"] = m.group(1).strip()
    else:
        m2 = re.search(r'\b(' + CERT_PATTERN + r')\b', texto, re.IGNORECASE)
        if m2: res["datos"]["no_certificado"] = m2.group(1).strip()

    # Soporta "Orden d e Servicio", "Orden de Servicio", "Orden  d e  Servicio" etc.
    m = re.search(r'(?:Orden\s*de\s*Servicio|Service\s*Order)\s*[:\s]*\n?\s*([A-Z]?[0-9]{2}[-]?[0-9]{3,6})', texto, re.IGNORECASE)
    if m: res["datos"]["orden_servicio"] = m.group(1).strip()

    m = re.search(r'(?:Nombre\s*del\s*cliente)\s*(?:\([^)]*\))?\s*[:\s]*\n?\s*(.*?)(?=\n\s*(?:Customer|Direcci[oó]n|Address|No\.|$))', texto, re.IGNORECASE | re.DOTALL)
    if m:
        val = m.group(1).strip().replace('\n',' ')
        val = re.sub(r'\s*Customer\s*name\s*', ' ', val, flags=re.IGNORECASE).strip()
        res["datos"]["cliente"] = _clean(val)

    m = re.search(r'(?:Descripci[oó]n\s*del\s*instrumento)\s*[:\s]*\n?\s*(.*?)(?=\n\s*(?:Instrument\s*description|Tipo|Intervalo|Marca|$))', texto, re.IGNORECASE | re.DOTALL)
    if m:
        val = m.group(1).strip().split('\n')[0]  # Solo la primera línea
        val = re.sub(r'\s*Instrument\s*description\s*', '', val, flags=re.IGNORECASE).strip()
        res["datos"]["instrumento"] = _clean(val)

    m = re.search(r'(?:Marca|Manufacturer)\s*(?:\([^)]*\))?\s*[:\s]*(.*?)(?=\s+(?:Modelo|Model)\s*[:\s])', texto, re.IGNORECASE)
    if m: res["datos"]["marca"] = _fix_font_field(_clean(m.group(1)))

    m = re.search(r'(?:Modelo|Model)\s*(?:\([^)]*\))?\s*[:\s]*(.*?)(?=\s+(?:Serie|Serial|N[o°]))', texto, re.IGNORECASE)
    if m: res["datos"]["modelo"] = _fix_font_field(_clean(m.group(1)))

    m = re.search(r'(?:Serie|Serial\s*(?:Number)?)\s*[:\s]*(.*?)(?=\n|\s{2,}|$)', texto, re.IGNORECASE | re.MULTILINE)
    if m:
        val = m.group(1).strip()
        if len(val) > 60: val = val[:60].strip()
        res["datos"]["serie"] = _fix_font_field(_clean(val))

    m = re.search(r'(?:Identificaci[oó]n/Ubicaci[oó]n|Identification/Location)\s*[:\s]*\n?\s*(.*?)(?=\n\s*(?:Identification|Magnitud|Evaluated|$))', texto, re.IGNORECASE | re.DOTALL)
    if m:
        val = m.group(1).strip().replace('\n', ' ')
        val = re.sub(r'\s*Identification/Location\s*', ' ', val, flags=re.IGNORECASE).strip()
        res["datos"]["identificacion"] = _fix_font_field(_clean(val))

    print(json.dumps(res, ensure_ascii=False, indent=2))

# ── VALIDADOR ─────────────────────────────────────────────────────────────────
def validar_certificado_vs_orden(cert_datos, partida):
    def n(s): return re.sub(r'\s+', ' ', str(s or '')).strip().lower()
    def vacio(s): return n(s) in ('', 'no indicado', 'no indicada', 'no especificado')
    comparaciones = [
        ("no_certificado", cert_datos.get("no_certificado"), partida.get("no_certificado")),
        ("marca",          cert_datos.get("marca"),          partida.get("marca")),
        ("modelo",         cert_datos.get("modelo"),         partida.get("modelo")),
        ("serie",          cert_datos.get("serie"),          partida.get("no_serie")),
        ("identificacion", cert_datos.get("identificacion"), partida.get("identificacion")),
    ]
    ok, fail = [], []
    for campo, vc, vo in comparaciones:
        if vacio(vc) or vacio(vo): continue
        c, o = n(vc), n(vo)
        if c == o or c in o or o in c: ok.append(campo)
        else: fail.append({"campo": campo, "en_certificado": vc, "en_orden": vo})
    total = len(ok) + len(fail)
    return {"coincide": len(fail)==0 and len(ok)>0, "confianza": round(len(ok)/total*100) if total else 0,
            "campos_ok": ok, "campos_fail": fail}

# ── ENTRY POINT ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Uso: parser_ia.py [--certificado] <archivo.pdf>"})); sys.exit(1)
        modo_cert = "--certificado" in sys.argv
        archivo = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
        if not archivo:
            print(json.dumps({"error": "No se proporcionó ruta"})); sys.exit(1)
        if modo_cert: parse_certificado(archivo)
        else: parse_orden(archivo)
    except Exception as e:
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
