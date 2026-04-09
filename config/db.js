// config/db.js — Conexión a MongoDB Atlas con reconexión automática
'use strict';
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI no está definida en .env — revisa el archivo .env');
    }

    // Opciones de conexión recomendadas para Atlas
    const conn = await mongoose.connect(uri, {
      dbName:              process.env.DB_NAME || 'edusistema',
      serverSelectionTimeoutMS: 10000, // 10 seg timeout para conectar
      socketTimeoutMS:          45000, // 45 seg timeout de socket
      maxPoolSize:              10,    // máximo 10 conexiones simultáneas
    });

    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
    console.log(`📦 Base de datos: ${conn.connection.name}`);

    // Eventos de conexión
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB desconectado — intentando reconectar...');
    });
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconectado');
    });
    mongoose.connection.on('error', (err) => {
      console.error('❌ Error en conexión MongoDB:', err.message);
    });

  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    if (err.message.includes('MONGODB_URI')) {
      console.error('   → Asegúrate de que .env tenga: MONGODB_URI=mongodb+srv://...');
    }
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('   → No se puede resolver el host. Verifica tu conexión a internet.');
    }
    if (err.message.includes('Authentication failed')) {
      console.error('   → Credenciales de MongoDB incorrectas. Verifica usuario/contraseña en MONGODB_URI.');
    }
    process.exit(1);
  }
};

module.exports = connectDB;
