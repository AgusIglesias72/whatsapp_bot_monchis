// Script de prueba para el endpoint document_rejected
// Ejecutar: node test-document-rejected.js

const BOT_URL = process.env.BOT_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || '';

// Test 1: Caso exitoso - Motivo rápido
async function testSuccessQuickReason() {
  console.log('\n📋 Test 1: Caso exitoso con motivo rápido');
  console.log('=' .repeat(50));

  const payload = {
    phone: '595981234567',
    name: 'María López',
    type: 'document_rejected',
    metadata: {
      documentType: 'CRIMINAL_RECORD',
      documentTypeName: 'Certificado de Antecedentes Penales',
      rejectionReason: 'Documento Vencido',
      rejectedAt: '2025-01-05T12:30:00.000Z',
      documentId: 'clxxxxxxxxxxxxxx',
      triggeredBy: 'document_rejection',
      adminId: 'user_xxxxxxxxxxxxx'
    }
  };

  try {
    const response = await fetch(`${BOT_URL}/send-contextual-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Test 1 EXITOSO');
    } else {
      console.log('❌ Test 1 FALLIDO');
    }
  } catch (error) {
    console.error('❌ Error en Test 1:', error.message);
  }
}

// Test 2: Caso exitoso - Motivo personalizado largo
async function testSuccessCustomReason() {
  console.log('\n📋 Test 2: Caso exitoso con motivo personalizado');
  console.log('=' .repeat(50));

  const payload = {
    phone: '595981234567',
    name: 'Carlos Ramírez',
    type: 'document_rejected',
    metadata: {
      documentType: 'CRIMINAL_RECORD',
      documentTypeName: 'Certificado de Antecedentes Penales',
      rejectionReason: 'La imagen está borrosa y no se pueden leer los datos claramente. Por favor, saca una foto con mejor iluminación.'
    }
  };

  try {
    const response = await fetch(`${BOT_URL}/send-contextual-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Test 2 EXITOSO');
    } else {
      console.log('❌ Test 2 FALLIDO');
    }
  } catch (error) {
    console.error('❌ Error en Test 2:', error.message);
  }
}

// Test 3: Error - Falta rejectionReason
async function testMissingRejectionReason() {
  console.log('\n📋 Test 3: Error - Falta rejectionReason (debe retornar 400)');
  console.log('=' .repeat(50));

  const payload = {
    phone: '595981234567',
    name: 'Test User',
    type: 'document_rejected',
    metadata: {
      documentTypeName: 'Certificado de Antecedentes Penales'
      // Falta rejectionReason
    }
  };

  try {
    const response = await fetch(`${BOT_URL}/send-contextual-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.status === 400) {
      console.log('✅ Test 3 EXITOSO (devolvió 400 como esperado)');
    } else {
      console.log('❌ Test 3 FALLIDO (debía devolver 400)');
    }
  } catch (error) {
    console.error('❌ Error en Test 3:', error.message);
  }
}

// Test 4: Error - documentType inválido
async function testInvalidDocumentType() {
  console.log('\n📋 Test 4: Error - documentType inválido (debe retornar 400)');
  console.log('=' .repeat(50));

  const payload = {
    phone: '595981234567',
    name: 'Test User',
    type: 'document_rejected',
    metadata: {
      documentType: 'DRIVERS_LICENSE', // Tipo no permitido
      documentTypeName: 'Licencia de Conducir',
      rejectionReason: 'Documento Vencido'
    }
  };

  try {
    const response = await fetch(`${BOT_URL}/send-contextual-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.status === 400) {
      console.log('✅ Test 4 EXITOSO (devolvió 400 como esperado)');
    } else {
      console.log('❌ Test 4 FALLIDO (debía devolver 400)');
    }
  } catch (error) {
    console.error('❌ Error en Test 4:', error.message);
  }
}

// Test 5: Sin documentType (debe funcionar)
async function testWithoutDocumentType() {
  console.log('\n📋 Test 5: Sin documentType - debe funcionar (es opcional)');
  console.log('=' .repeat(50));

  const payload = {
    phone: '595981234567',
    name: 'Test User',
    type: 'document_rejected',
    metadata: {
      // No incluimos documentType
      documentTypeName: 'Certificado de Antecedentes Penales',
      rejectionReason: 'Documento Vencido'
    }
  };

  try {
    const response = await fetch(`${BOT_URL}/send-contextual-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Test 5 EXITOSO');
    } else {
      console.log('❌ Test 5 FALLIDO');
    }
  } catch (error) {
    console.error('❌ Error en Test 5:', error.message);
  }
}

// Ejecutar todos los tests
async function runAllTests() {
  console.log('\n🚀 Iniciando tests para document_rejected endpoint');
  console.log('🌐 URL:', BOT_URL);
  console.log('🔐 API Key:', API_KEY ? 'Configurada ✅' : 'No configurada ⚠️');

  await testSuccessQuickReason();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testSuccessCustomReason();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testMissingRejectionReason();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testInvalidDocumentType();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testWithoutDocumentType();

  console.log('\n✅ Tests completados\n');
}

// Ejecutar
runAllTests().catch(console.error);
