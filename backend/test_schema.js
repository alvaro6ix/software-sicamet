// Test: Verifica que el schema de la BD coincide con las queries del backend (columnas REALES)
const db = require('./bd.js');

// Columnas basadas en lo que el backend ACTUALMENTE usa
const EXPECTED = {
  instrumentos_estatus: [
    'id', 'orden_cotizacion', 'cotizacion_referencia', 'fecha_recepcion', 'fecha_recepcion_parsed',
    'servicio_solicitado', 'empresa', 'nombre_certificados', 'direccion', 'persona',
    'contacto_email', 'tipo_servicio', 'nombre_instrumento', 'marca', 'modelo', 'no_serie',
    'numero_informe', 'no_certificado', 'clave', 'identificacion', 'ubicacion',
    'requerimientos_especiales', 'puntos_calibrar', 'intervalo_calibracion', 'sla',
    'estatus_actual', 'area_laboratorio', 'metrologo_asignado_id', 'certificado_url',
    'rechazos_aseguramiento', 'fecha_ingreso', 'fecha_entrega'
  ],
  instrumento_metrologos: [
    'id', 'instrumento_id', 'usuario_id', 'estatus', 'fecha_asignacion', 'fecha_fin'
  ],
  rechazos_aseguramiento: [
    'id', 'instrumento_id', 'usuario_rechaza_id', 'motivo', 'estatus_previo', 
    'usuario_destino_id', 'fecha_rechazo'
  ],
  auditoria_instrumentos: [
    'id', 'instrumento_id', 'accion', 'usuario_id', 'detalles', 'fecha'
  ],
  feedback_bot: [
    'id', 'cliente_wa', 'empresa', 'mensaje', 'leido_admin'
  ],
  notificaciones_globales: [
    'id', 'titulo', 'detalle', 'tipo', 'ruta', 'urgencia', 'creador_id', 'metadata', 'created_at'
  ],
  notificaciones_leidas: [
    'id', 'notificacion_id', 'usuario_id', 'leido_at'
  ],
  laboratorio_areas: [
    'id', 'nombre', 'descripcion', 'activa', 'created_at'
  ],
  usuarios: [
    'id', 'nombre', 'email', 'password_hash', 'rol', 'area', 'activo', 'permisos', 'created_at'
  ]
};

(async () => {
  try {
    let allOk = true;
    let issues = [];
    
    for (const [table, expectedCols] of Object.entries(EXPECTED)) {
      try {
        const [rows] = await db.query(`SHOW COLUMNS FROM ${table}`);
        const actualCols = rows.map(r => r.Field);
        
        const missing = expectedCols.filter(c => !actualCols.includes(c));
        const extra = actualCols.filter(c => !expectedCols.includes(c));
        
        if (missing.length > 0) {
          issues.push(`❌ ${table}: FALTAN columnas: ${missing.join(', ')}`);
          allOk = false;
        } else {
          console.log(`✅ ${table}: OK (${expectedCols.length} cols)`);
        }
        
        if (extra.length > 0) {
          console.log(`   ℹ️  ${table}: Extra: ${extra.join(', ')}`);
        }
      } catch (e) {
        issues.push(`❌ ${table}: NO EXISTE - ${e.message}`);
        allOk = false;
      }
    }

    // Verificar índices críticos
    console.log('\n📊 Verificando índices...');
    const [idxInst] = await db.query('SHOW INDEX FROM instrumentos_estatus');
    const idxNames = idxInst.map(i => i.Key_name);
    if (idxNames.includes('numero_informe')) {
      console.log('   ✅ Índice numero_informe existe');
    } else {
      console.log('   ⚠️  Índice numero_informe falta (no crítico)');
    }

    if (allOk) {
      console.log('\n🎉 SCHEMA VERIFICATION PASSED!');
    } else {
      console.log('\n⚠️  SCHEMA ISSUES:');
      issues.forEach(i => console.log('   ' + i));
    }
    
    process.exit(allOk ? 0 : 1);
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  }
})();
