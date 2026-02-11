const express = require('express');
const cors = require('cors');
const xlsx = require('xlsx');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Excel dosyası path (local/PV'de)
const EXCEL_PATH = process.env.EXCEL_PATH || './capability_excel.xlsx';

// In-memory data cache
let dataCache = {
  applications: [],
  capabilities: [],
  domains: [],
  verticals: {},
  functions: {}
};

// Excel okuma fonksiyonu
function loadExcelData() {
  try {
    if (!fs.existsSync(EXCEL_PATH)) {
      console.log('Excel dosyası bulunamadı:', EXCEL_PATH);
      return false;
    }

    const workbook = xlsx.readFile(EXCEL_PATH);
    
    // Applications sheet
    const appSheet = workbook.Sheets['Applications'];
    const applications = xlsx.utils.sheet_to_json(appSheet);
    
    // Matrix sheet
    const matrixSheet = workbook.Sheets['Matrix'];
    const matrixData = xlsx.utils.sheet_to_json(matrixSheet);
    
    // Process data
    dataCache.applications = applications;
    dataCache.capabilities = processCapabilities(matrixData, applications);
    dataCache.domains = [...new Set(matrixData.map(r => r.domain))].filter(Boolean);
    
    // Verticals per domain
    dataCache.domains.forEach(domain => {
      dataCache.verticals[domain] = [...new Set(
        matrixData.filter(r => r.domain === domain).map(r => r.vertical)
      )].filter(Boolean);
    });
    
    // Functions per vertical
    matrixData.forEach(row => {
      if (row.vertical) {
        if (!dataCache.functions[row.vertical]) {
          dataCache.functions[row.vertical] = [];
        }
        dataCache.functions[row.vertical].push({
          name: row.functionname,
          descDE: row.functiondescriptionDE,
          descEN: row.functiondescriptionEN
        });
      }
    });
    
    console.log('Excel data loaded successfully');
    console.log(`Applications: ${dataCache.applications.length}`);
    console.log(`Capabilities: ${dataCache.capabilities.length}`);
    console.log(`Domains: ${dataCache.domains.length}`);
    
    return true;
  } catch (error) {
    console.error('Excel okuma hatası:', error);
    return false;
  }
}

// Capability processing
function processCapabilities(matrixData, applications) {
  const capabilities = [];
  
  matrixData.forEach(row => {
    const capability = {
      domain: row.domain,
      vertical: row.vertical,
      functionName: row.functionname,
      functionDescDE: row.functiondescriptionDE,
      functionDescEN: row.functiondescriptionEN,
      applications: {}
    };
    
    // Application skorlarını topla
    Object.keys(row).forEach(key => {
      if (key.startsWith('appName') && row[key]) {
        const appName = row[key];
        const scoreKey = key; // Aynı kolon içinde skor var
        capability.applications[appName] = parseInt(row[key + '_score']) || 0;
      }
    });
    
    capabilities.push(capability);
  });
  
  return capabilities;
}

// Startup: Excel'i yükle
loadExcelData();

// ===================
// API ENDPOINTS
// ===================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    excelLoaded: dataCache.applications.length > 0,
    timestamp: new Date().toISOString()
  });
});

// Applications
app.get('/api/applications', (req, res) => {
  let apps = [...dataCache.applications];
  
  // Filters
  if (req.query.lifecycle) {
    apps = apps.filter(a => a.appLifecycleStatus === req.query.lifecycle);
  }
  if (req.query.businessOwner) {
    apps = apps.filter(a => a.appBusinessOwner === req.query.businessOwner);
  }
  if (req.query.domain) {
    // Domain'deki capability'leri olan uygulamaları getir
    const domainCapabilities = dataCache.capabilities.filter(c => c.domain === req.query.domain);
    const appNames = new Set();
    domainCapabilities.forEach(cap => {
      Object.keys(cap.applications).forEach(appName => appNames.add(appName));
    });
    apps = apps.filter(a => appNames.has(a.appName));
  }
  
  res.json({ count: apps.length, applications: apps });
});

// Capabilities
app.get('/api/capabilities', (req, res) => {
  let caps = [...dataCache.capabilities];
  
  if (req.query.domain) {
    caps = caps.filter(c => c.domain === req.query.domain);
  }
  if (req.query.vertical) {
    caps = caps.filter(c => c.vertical === req.query.vertical);
  }
  
  res.json({ count: caps.length, capabilities: caps });
});

// Applications by capability (function + score filter)
app.get('/api/applications/by-capability', (req, res) => {
  const { function: funcName, score, minScore, maxScore } = req.query;
  
  if (!funcName) {
    return res.status(400).json({ error: 'function parameter required' });
  }
  
  const capability = dataCache.capabilities.find(c => c.functionName === funcName);
  
  if (!capability) {
    return res.status(404).json({ error: 'Function not found' });
  }
  
  let apps = [];
  Object.entries(capability.applications).forEach(([appName, appScore]) => {
    if (score && appScore != score) return;
    if (minScore && appScore < minScore) return;
    if (maxScore && appScore > maxScore) return;
    
    const appDetails = dataCache.applications.find(a => a.appName === appName);
    if (appDetails) {
      apps.push({ ...appDetails, capabilityScore: appScore });
    }
  });
  
  res.json({ 
    function: funcName, 
    filterScore: score || `${minScore || 0}-${maxScore || 5}`,
    count: apps.length, 
    applications: apps 
  });
});

// Domains
app.get('/api/domains', (req, res) => {
  res.json({ domains: dataCache.domains });
});

// Verticals (by domain)
app.get('/api/verticals', (req, res) => {
  const domain = req.query.domain;
  
  if (!domain) {
    return res.json({ verticals: dataCache.verticals });
  }
  
  res.json({ domain, verticals: dataCache.verticals[domain] || [] });
});

// Functions (by vertical)
app.get('/api/functions', (req, res) => {
  const vertical = req.query.vertical;
  
  if (!vertical) {
    return res.json({ functions: dataCache.functions });
  }
  
  res.json({ vertical, functions: dataCache.functions[vertical] || [] });
});

// Start server
app.listen(PORT, () => {
  console.log(`Capability Map Backend running on port ${PORT}`);
});
