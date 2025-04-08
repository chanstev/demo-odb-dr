const LATENCY_INTERVAL = 3000;
const LATENCY_THRESHOLD = 300; 

// let dbinfo_interval = LATENCY_INTERVAL/2; 
let latencyData = [];
let timeLabels = [];
// let dbInfoPolling = false;
let lastDbInfo = null;
let dbInfoTimer = null;
let latencyTimer = null;
let apiBase = '';
let enquirySource = '';  // New variable to hold Enquiry Source

const azElement = document.getElementById('az');
const standbyAzElement = document.getElementById('standbyAz');
const enquiryDirectionElement = document.getElementById('enquiryDirection');
const replicationDirectionElement = document.getElementById('replicationDirection');
const enquirySourceElement = document.getElementById('enquirySource'); // Enquiry Source
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const ctx = document.getElementById('latencyChart').getContext('2d');

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: timeLabels,
    datasets: [{
      label: 'SQL Latency (ms)',
      data: latencyData,
      borderColor: 'blue',
      fill: false,
      tension: 0.1
    }]
  },
  options: {
    scales: {
      x: { display: true },
      y: { beginAtZero: true }
    }
  }
});

function fetchDbInfo() {
  fetch(`${apiBase}/dbinfo`)
    .then(res => res.json())
    .then(data => {
      // Display Primary AZ
      const primaryAz = data.AVAILABILITY_DOMAIN || 'Unknown';
      azElement.textContent = primaryAz;

      // Update Enquiry Direction whenever Primary AZ is updated
      updateEnquiryDirection(primaryAz);

      // Extract Standby AZ (if available)
      if (data.AUTONOMOUS_DATA_GUARD && data.AUTONOMOUS_DATA_GUARD.length > 0) {
        const standbyAz = data.AUTONOMOUS_DATA_GUARD[0].AVAILABILITY_DOMAIN || 'Unknown';
        standbyAzElement.textContent = standbyAz;

      } else {
        standbyAzElement.textContent = 'Not Available';
      }
      replicationDirectionElement.textContent = `${extractRegionFromAz(azElement.textContent)} → ${extractRegionFromAz(standbyAzElement.textContent)}`;

      // Handle DB info change detection
      if (JSON.stringify(data) !== JSON.stringify(lastDbInfo)) {
        lastDbInfo = data;
        logEvent(`Dataguard Direction: ${replicationDirectionElement.textContent}`);
        highlightAzChange(); // Highlight AZ change with background color
      }
    })
    .catch(err => {
      console.error('Error fetching dbinfo:', err);
      // logEvent(`Error fetching dbinfo: ${err}`);
      azElement.textContent = 'Error';
      standbyAzElement.textContent = 'Error';
    });
}

function fetchSourceRegion() {
  fetch(`${apiBase}/`)
    .then(res => res.json())
    .then(data => {
      // Assuming the source region is returned as "city"
      const sourceCity = data.city || 'Unknown'; // Using "city" field as per your specification
      updateEnquirySource(sourceCity);
    })
    .catch(err => {
      console.error('Error fetching source region:', err);
    });
}

function updateEnquirySource(sourceCity) {
  enquirySource = sourceCity.toUpperCase(); // Store and show it in uppercase
  enquirySourceElement.textContent = enquirySource;
}

function updateEnquiryDirection(primaryAz) {
  if (!enquirySource) {
    return;  // Enquiry Source must be available before updating Enquiry Direction
  }

  // Extract the target region from AVAILABILITY_DOMAIN
  const targetRegion = extractRegionFromAz(primaryAz);
  enquiryDirectionElement.textContent = `${enquirySource} → ${targetRegion}`;
}

function extractRegionFromAz(availabilityDomain) {
  // Extracts the region part from the availability domain string (e.g., "BWQr:UK-LONDON-1-AD-3")
  const regionMatch = availabilityDomain.match(/^.*:(\w+)-(\w+)-\d+-AD-\d+/);
  if (regionMatch && regionMatch.length > 2) {
    return regionMatch[2]; // Extracts "LONDON" from "UK-LONDON-1-AD-3"
  } else {
    return 'Unknown';
  }
}

function setDbInfoPolling(interval) {
  clearInterval(dbInfoTimer)
  dbInfoTimer = setInterval(fetchDbInfo, interval);
}

// function fastDbInfoPolling() {
//   if (!dbInfoTimer) {
//     dbInfoTimer = setInterval(fetchDbInfo, DBINFO_INTERVAL);
//   }
// }

// function slowDbInfoPolling() {
//   clearInterval(dbInfoTimer);
//   dbInfoTimer = null;
// }

function fetchLatency() {
  fetch(`${apiBase}/latency`)
    .then(res => res.json())
    .then(data => {
      latency = data.latency_ms;
      timestamp = new Date(data.timestamp).toLocaleTimeString();

      timeLabels.push(timestamp);
      latencyData.push(latency);

      if (timeLabels.length > 30) {
        timeLabels.shift();
        latencyData.shift();
      }

      chart.update();

      if (latency > 0 && latency < LATENCY_THRESHOLD) {
        setDbInfoPolling(LATENCY_INTERVAL*2)
        // slowDbInfoPolling();
      } else {
        // fastDbInfoPolling();
        setDbInfoPolling(LATENCY_INTERVAL*0.5)
        logEvent(`Abnormal latency detected: ${latency} ms`);
      }
    })
    .catch(err => {
      // console.error('Error fetching latency:', err);
      // logEvent(`Error fetching latency: ${err}`);      
      timeLabels.push(new Date().toLocaleTimeString());
      latencyData.push(0);
      if (timeLabels.length > 30) {
        timeLabels.shift();
        latencyData.shift();
      }  
      chart.update();
      // startDbInfoPolling();
      setDbInfoPolling(LATENCY_INTERVAL*0.5)
    });
}

function highlightAzChange() {
  // Highlight the AZ info background by changing color temporarily
  const highlightDuration = 3000; // Duration for highlighting (3 seconds)

  azElement.style.backgroundColor = 'yellow';
  standbyAzElement.style.backgroundColor = 'yellow';

  setTimeout(() => {
    azElement.style.backgroundColor = '';
    standbyAzElement.style.backgroundColor = '';
  }, highlightDuration);
}

function startMonitoring() {
  apiBase = document.getElementById('apiBase').value.trim();
  if (!apiBase) {
    alert('Please enter a valid API base URL.');
    return;
  }

  // Ensure the URL uses https by default
  if (!apiBase.startsWith("https://")) {
    alert("The API URL must start with 'https://'");
    return;
  }

  // Fetch Enquiry Source
  fetchSourceRegion();
  if (latencyTimer) clearInterval(latencyTimer);
  latencyTimer = setInterval(fetchLatency, LATENCY_INTERVAL);

  // Fetch DB Info
  fetchDbInfo();
  if (dbInfoTimer) clearInterval(dbInfoTimer);
  dbInfoTimer = setInterval(fetchLatency, LATENCY_INTERVAL);

  
  // Change button visibility
  startButton.style.display = 'none';
  stopButton.style.display = 'inline-block';
}

function stopMonitoring() {
  // Clear the polling intervals
  clearInterval(latencyTimer);
  latencyTimer = null;

  clearInterval(dbInfoTimer);
  dbInfoTimer = null;

  // stopDbInfoPolling();
  
  // Change button visibility
  stopButton.style.display = 'none';
  startButton.style.display = 'inline-block';
}

function logEvent(message) {
  const container = document.getElementById('log-container');
  const entry = document.createElement('div');
  const now = new Date().toLocaleTimeString();
  entry.textContent = `[${now}] ${message}`;
  container.appendChild(entry);
}
