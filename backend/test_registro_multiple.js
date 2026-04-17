// Test: Simula el registro múltiple de instrumentos (como lo hace Registro.jsx)
const db = require('./bd.js');
const jwt = require('jsonwebtoken');

(async () => {
  try {
    console.log('=== TEST: Registro Múltiple de Instrumentos ===\n');

    // 1. Crear token JWT válido (simula login de admin)
    const token = jwt.sign({ id: 1, nombre: 'Administrador', rol: 'admin' }, '***REDACTED-OLD-JWT***');
    console.log('✅ Token generado');

    // 2. Simular datos de registro (como los envía Registro.jsx)
    const instrumentos = [
      {
        orden_cotizacion: 'TEST-' + Date.now(),
        cotizacion_referencia: 'REF-001',
        fecha_recepcion: new Date().toISOString().split('T')[0],
        servicio_solicitado: 'Calibración',
        empresa: 'Empresa Test SA',
        nombre_certificados: 'Juan Pérez',
        direccion: 'Calle 123',
        persona: 'Juan Pérez',
        contacto_email: 'test@test.com',
        tipo_servicio: 'Calibración',
        nombre_instrumento: 'Termómetro Digital',
        marca: 'Fluke',
        modelo: 'MOD-100',
        no_serie: 'SN-001',
        no_certificado: null,
        clave: 'CLAVE-001',
        identificacion: 'ID-001',
        ubicacion: 'Lab 1',
        requerimientos_especiales: 'Ninguno',
        puntos_calibrar: 3,
        intervalo_calibracion: 'Anual',
        sla: '7',
        area_laboratorio: 'Temperatura'
      },
      {
        orden_cotizacion: 'TEST-' + Date.now(),
        cotizacion_referencia: 'REF-001',
        fecha_recepcion: new Date().toISOString().split('T')[0],
        servicio_solicitado: 'Calibración',
        empresa: 'Empresa Test SA',
        nombre_certificados: 'Juan Pérez',
        direccion: 'Calle 123',
        persona: 'Juan Pérez',
        contacto_email: 'test@test.com',
        tipo_servicio: 'Calibración',
        nombre_instrumento: 'Higrómetro',
        marca: 'Testo',
        modelo: 'MOD-200',
        no_serie: 'SN-002',
        no_certificado: null,
        clave: 'CLAVE-002',
        identificacion: 'ID-002',
        ubicacion: 'Lab 2',
        requerimientos_especiales: 'Ninguno',
        puntos_calibrar: 2,
        intervalo_calibracion: 'Semestral',
        sla: '5',
        area_laboratorio: 'Humedad'
      }
    ];

    console.log(`📋 ${instrumentos.length} instrumentos a registrar`);

    // 3. Ejecutar la query directamente (como lo hace index.js)
    const query = `INSERT INTO instrumentos_estatus
      (orden_cotizacion, cotizacion_referencia, fecha_recepcion, fecha_recepcion_parsed, servicio_solicitado, empresa, nombre_certificados, direccion, persona, contacto_email, tipo_servicio, nombre_instrumento, marca, modelo, no_serie, numero_informe, no_certificado, clave, identificacion, ubicacion, requerimientos_especiales, puntos_calibrar, intervalo_calibracion, sla, estatus_actual, area_laboratorio, metrologo_asignado_id)
      VALUES ?`;

    const valores = instrumentos.map(ins => {
      let fechaParsed = null;
      if (ins.fecha_recepcion) {
        const limpia = ins.fecha_recepcion.trim();
        const m1 = limpia.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m1) fechaParsed = `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
        else {
          const m2 = limpia.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
          if (m2) fechaParsed = `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
          else {
            const m3 = limpia.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (m3) fechaParsed = limpia;
          }
        }
      }
      return [
        ins.orden_cotizacion, ins.cotizacion_referencia || null, ins.fecha_recepcion || null, fechaParsed,
        ins.servicio_solicitado || null,
        ins.empresa, ins.nombre_certificados || null, ins.direccion || null, ins.persona, ins.contacto_email || null,
        ins.tipo_servicio, ins.nombre_instrumento,
        ins.marca, ins.modelo, ins.no_serie, ins.no_certificado || null, ins.no_certificado || null,
        ins.clave || null, ins.identificacion, ins.ubicacion, ins.requerimientos_especiales, ins.puntos_calibrar,
        ins.intervalo_calibracion || null, ins.sla, 'Laboratorio',
        ins.area_laboratorio || null, null
      ];
    });

    console.log('\n📝 Ejecutando INSERT bulk...');
    const [r] = await db.query(query, [valores]);
    const firstId = r.insertId;
    const count = r.affectedRows;
    console.log(`✅ INSERT exitoso! firstId=${firstId}, affectedRows=${count}`);

    // 4. Asignación múltiple
    const metrologos_ids = [6, 7]; // Oscar Daniel, Miriam
    const imValues = [];
    for (let i = 0; i < count; i++) {
      const instId = firstId + i;
      metrologos_ids.forEach(mid => {
        imValues.push([instId, mid, 'asignado']);
      });
    }
    if (imValues.length > 0) {
      await db.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES ?', [imValues]);
      console.log(`✅ Asignación múltiple: ${imValues.length} registros`);
    }

    // 5. Auditoría (EL FIX)
    console.log('\n📝 Ejecutando INSERT de auditoría (con FIX)...');
    const auditoriaValues = Array.from({length: count}, (_, i) => [
      firstId + i, 'registro_multiple', 1,
      JSON.stringify({orden: instrumentos[0]?.orden_cotizacion, instrumento: instrumentos[i]?.nombre_instrumento})
    ]);
    for (const row of auditoriaValues) {
      await db.query(
        `INSERT INTO auditoria_instrumentos (instrumento_id, accion, usuario_id, detalles) VALUES (?, ?, ?, ?)`,
        [row[0], row[1], row[2], row[3]]
      );
    }
    console.log(`✅ Auditoría: ${count} registros insertados`);

    // 6. Verificar que los datos se insertaron correctamente
    const [[check]] = await db.query('SELECT COUNT(*) as total FROM instrumentos_estatus WHERE orden_cotizacion LIKE ?', ['TEST-%']);
    console.log(`\n🔍 Verificación: ${check.total} instrumentos con orden TEST en BD`);

    const [metros] = await db.query(`
      SELECT im.instrumento_id, u.nombre 
      FROM instrumento_metrologos im 
      JOIN usuarios u ON u.id = im.usuario_id 
      WHERE im.instrumento_id IN (${firstId}, ${firstId + 1})
    `);
    console.log('👨‍🔧 Metrologos asignados:', JSON.stringify(metros));

    const [audit] = await db.query(`
      SELECT instrumento_id, accion, detalles 
      FROM auditoria_instrumentos 
      WHERE instrumento_id IN (${firstId}, ${firstId + 1})
    `);
    console.log('📋 Auditoría:', JSON.stringify(audit));

    // 7. Cleanup (eliminar datos de test)
    console.log('\n🧹 Limpiando datos de test...');
    await db.query('DELETE FROM auditoria_instrumentos WHERE instrumento_id IN (?, ?)', [firstId, firstId + 1]);
    await db.query('DELETE FROM instrumento_metrologos WHERE instrumento_id IN (?, ?)', [firstId, firstId + 1]);
    await db.query('DELETE FROM instrumentos_estatus WHERE id IN (?, ?)', [firstId, firstId + 1]);
    console.log('✅ Cleanup completado');

    console.log('\n🎉 TEST PASADO! El registro múltiple funciona correctamente.');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST FALLÓ:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
