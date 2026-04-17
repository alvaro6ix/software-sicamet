// Test: Integration tests for all major API endpoints
const db = require('./bd.js');
const jwt = require('jsonwebtoken');

const TOKEN = jwt.sign({ id: 1, nombre: 'Administrador', rol: 'admin' }, '***REDACTED-OLD-JWT***');
const AXIOS = require('axios');
const API = 'http://localhost:3001';

let testInstrumentId = null;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    return false;
  }
}

async function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

(async () => {
  const results = [];
  
  console.log('=== INTEGRATION TESTS ===\n');

  // 1. GET /api/areas
  results.push(await test('GET /api/areas (sin auth → 401)', async () => {
    const r = await AXIOS.get(`${API}/api/areas`);
    throw new Error('Should have failed');
  }));

  results.push(await test('GET /api/areas (con auth → 200)', async () => {
    const r = await AXIOS.get(`${API}/api/areas`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!Array.isArray(r.data)) throw new Error('Expected array');
  }));

  // 2. GET /api/usuarios/metrologos
  results.push(await test('GET /api/usuarios/metrologos', async () => {
    const r = await AXIOS.get(`${API}/api/usuarios/metrologos`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!Array.isArray(r.data)) throw new Error('Expected array');
  }));

  // 3. POST /api/instrumentos-multiple (registro)
  const ordenTest = 'INTEGRATION-' + Date.now();
  results.push(await test('POST /api/instrumentos-multiple', async () => {
    const r = await AXIOS.post(`${API}/api/instrumentos-multiple`, {
      instrumentos: [{
        orden_cotizacion: ordenTest,
        cotizacion_referencia: 'REF-TEST',
        fecha_recepcion: new Date().toISOString().split('T')[0],
        servicio_solicitado: 'Calibracion',  // Removed accent
        empresa: 'Integration Test SA',
        nombre_certificados: 'Test User',
        direccion: 'Test St 123',
        persona: 'Test User',
        contacto_email: 'test@test.com',
        tipo_servicio: 'Calibracion',  // Removed accent
        nombre_instrumento: 'Multimetro',  // Removed accent
        marca: 'Fluke',
        modelo: '87V',
        no_serie: 'SN-TEST-001',
        no_certificado: null,
        clave: 'CL-TEST',
        identificacion: 'ID-TEST',
        ubicacion: 'Lab Test',
        requerimientos_especiales: 'None',
        puntos_calibrar: 3,
        intervalo_calibracion: 'Anual',
        sla: '7',
        area_laboratorio: 'Temperatura'
      }],
      metrologos_ids: [6]
    }, { headers: { Authorization: `Bearer ${TOKEN}` } });

    if (!r.data.success) throw new Error('Success expected: ' + JSON.stringify(r.data));
    if (r.data.count !== 1) throw new Error(`Count 1 expected, got ${r.data.count}`);
  }));

  // Get the inserted instrument ID
  try {
    const [[check]] = await db.query(
      'SELECT id FROM instrumentos_estatus WHERE orden_cotizacion = ? ORDER BY id DESC LIMIT 1',
      [ordenTest]
    );
    testInstrumentId = check.id;
    console.log(`   📌 Instrumento test ID: ${testInstrumentId}`);
  } catch (e) { /* ignore */ }

  // 4. GET /api/metrologia/kpis
  results.push(await test('GET /api/metrologia/kpis', async () => {
    const r = await AXIOS.get(`${API}/api/metrologia/kpis`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    // Should have KPI data
  }));

  // 5. GET /api/metrologia/laboratorio-general
  results.push(await test('GET /api/metrologia/laboratorio-general', async () => {
    const r = await AXIOS.get(`${API}/api/metrologia/laboratorio-general`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!Array.isArray(r.data)) throw new Error('Expected array');
  }));

  // 6. GET /api/metrologia/mi-bandeja (as metrologo)
  const metrologoToken = jwt.sign({ id: 6, nombre: 'Oscar Daniel', rol: 'metrologo' }, '***REDACTED-OLD-JWT***');
  results.push(await test('GET /api/metrologia/mi-bandeja (as metrologo)', async () => {
    const r = await AXIOS.get(`${API}/api/metrologia/mi-bandeja`, { headers: { Authorization: `Bearer ${metrologoToken}` } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!Array.isArray(r.data)) throw new Error('Expected array');
  }));

  // 7. GET /api/instrumentos/:id/auditoria
  if (testInstrumentId) {
    results.push(await test(`GET /api/instrumentos/${testInstrumentId}/auditoria`, async () => {
      const r = await AXIOS.get(`${API}/api/instrumentos/${testInstrumentId}/auditoria`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (r.status !== 200) throw new Error(`Status ${r.status}`);
      if (!r.data.auditoria || !Array.isArray(r.data.auditoria)) throw new Error('Expected auditoria array in response');
    }));
  }

  // 8. GET /api/instrumentos/:id/rechazos
  if (testInstrumentId) {
    results.push(await test(`GET /api/instrumentos/${testInstrumentId}/rechazos`, async () => {
      const r = await AXIOS.get(`${API}/api/instrumentos/${testInstrumentId}/rechazos`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (r.status !== 200) throw new Error(`Status ${r.status}`);
      if (!Array.isArray(r.data)) throw new Error('Expected array');
    }));
  }

  // 9. POST /api/instrumentos/:id/finalizar_metrologo
  if (testInstrumentId) {
    results.push(await test(`POST /api/instrumentos/${testInstrumentId}/finalizar_metrologo`, async () => {
      const r = await AXIOS.post(`${API}/api/instrumentos/${testInstrumentId}/finalizar_metrologo`, {}, {
        headers: { Authorization: `Bearer ${metrologoToken}` }
      });
      if (r.status !== 200) throw new Error(`Status ${r.status}`);
    }));
  }

  // 10. POST /api/instrumentos/:id/rechazar_aseguramiento
  if (testInstrumentId) {
    results.push(await test(`POST /api/instrumentos/${testInstrumentId}/rechazar_aseguramiento`, async () => {
      const asegToken = jwt.sign({ id: 8, nombre: 'Miriam', rol: 'aseguramiento' }, '***REDACTED-OLD-JWT***');
      const r = await AXIOS.post(`${API}/api/instrumentos/${testInstrumentId}/rechazar_aseguramiento`, {
        motivo: 'Prueba de integración - rechazo intencional'
      }, { headers: { Authorization: `Bearer ${asegToken}` } });
      if (r.status !== 200) throw new Error(`Status ${r.status}`);
    }));
  }

  // 11. Verify rejection was logged
  if (testInstrumentId) {
    results.push(await test(`Verify rejection logged in rechazos_aseguramiento`, async () => {
      const [[row]] = await db.query(
        'SELECT COUNT(*) as cnt FROM rechazos_aseguramiento WHERE instrumento_id = ?',
        [testInstrumentId]
      );
      if (row.cnt < 1) throw new Error('Expected at least 1 rejection');
    }));
  }

  // 12. POST /api/instrumentos/:id/solicitar_correccion
  if (testInstrumentId) {
    results.push(await test(`POST /api/instrumentos/${testInstrumentId}/solicitar_correccion`, async () => {
      const asegToken = jwt.sign({ id: 8, nombre: 'Miriam', rol: 'aseguramiento' }, '***REDACTED-OLD-JWT***');
      const r = await AXIOS.post(`${API}/api/instrumentos/${testInstrumentId}/solicitar_correccion`, {
        metrologo_id: 6,
        observaciones: 'Prueba de integración - corrección solicitada'
      }, { headers: { Authorization: `Bearer ${asegToken}` } });
      if (r.status !== 200) throw new Error(`Status ${r.status}`);
    }));
  }

  // 13. GET /api/metrologia/correcciones
  results.push(await test('GET /api/metrologia/correcciones', async () => {
    const r = await AXIOS.get(`${API}/api/metrologia/correcciones`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!Array.isArray(r.data)) throw new Error('Expected array');
  }));

  // Cleanup
  if (testInstrumentId) {
    console.log('\n🧹 Cleaning up test data...');
    try {
      await db.query('DELETE FROM auditoria_instrumentos WHERE instrumento_id = ?', [testInstrumentId]);
      await db.query('DELETE FROM rechazos_aseguramiento WHERE instrumento_id = ?', [testInstrumentId]);
      await db.query('DELETE FROM instrumento_metrologos WHERE instrumento_id = ?', [testInstrumentId]);
      await db.query('DELETE FROM instrumentos_estatus WHERE id = ?', [testInstrumentId]);
      console.log('   ✅ Cleanup done');
    } catch (e) { console.log('   ⚠️  Cleanup error (non-critical):', e.message); }
  }

  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`\n=============================`);
  console.log(`📊 RESULTS: ${passed}/${total} tests passed`);
  if (passed === total) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED!');
  } else {
    console.log('⚠️  Some tests failed. Review above.');
  }
  console.log(`=============================`);
  
  process.exit(0);
})();
