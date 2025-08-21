// ===============================
// Base de datos de precios por m² en Lima (Agosto 2024)
// ===============================
const DATA = {
  "San Isidro": {
    type: ["Departamento", "Casa", "Terreno"],
    zones: {
      "San Isidro Sur (Financiero)": 11781,
      "San Isidro Centro": 10850,
      "San Isidro Norte": 10200,
      "El Golf": 11500,
      "Country Club": 11200,
      "Orrantia": 10800,
      "Corpac": 9950
    }
  },
  "Miraflores": {
    type: ["Departamento", "Casa", "Terreno"],
    zones: {
      "Malecon de Miraflores": 10800,
      "Parque Kennedy": 10200,
      "Reducto": 9800,
      "San Antonio": 9500,
      "Miraflores Alto": 9200,
      "28 de Julio": 8900,
      "Limite Barranco": 8700
    }
  },
  "Santiago de Surco": {
    type: ["Departamento", "Casa", "Terreno"],
    zones: {
      "Monterrico": 7800,
      "Chacarilla": 7400,
      "Las Gardenias": 7200,
      "Valle Hermoso": 7000,
      "Surco Centro": 6800,
      "Surco Viejo": 6400,
      "Limite SJM": 5900
    }
  },
  // Añade aquí todos los demás distritos y zonas
};

// ===============================
// Configuración de Factores (Actualizada)
// ===============================
const FACTORES_TASACION = {
  antiguedad: {
    depreciacionAnual: 0.01,   // 1% anual
    depreciacionMaxima: 0.30,  // Máx. 30%
    premiumNuevo: 0.05         // +5% si tiene ≤ 2 años
  },
  dormitorios: {
    base: 2,
    incrementoPorDormitorio: 0.08,
    decrementoPorDefecto: 0.12,
    maximoIncremento: 0.25
  },
  banos: {
    base: 2,
    incrementoPorBano: 0.06,
    decrementoPorDefecto: 0.15,
    maximoIncremento: 0.18
  },
  areaLibre: {
    departamento: 0.25,
    casa: 0.40,
    terreno: 0.90
  },
  tipoInmueble: {
    departamento: 1.0,
    casa: 1.12,
    terreno: 0.80,
    oficina: 0.95,
    local: 0.85
  },
  eficienciaEnergetica: {
    A: 1.10,
    B: 1.05,
    C: 1.00,
    D: 0.95,
    E: 0.90,
    F: 0.85
  },
  estadoConservacion: {
    excelente: 1.05,    // +5%
    bueno: 1.00,        // Sin ajuste
    regular: 0.90,      // -10%
    remodelar: 0.75     // -25%
  }
};

// ===============================
// Función: Obtener tipo de cambio
// ===============================
async function obtenerTipoCambio() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/PEN");
    const data = await res.json();
    if (data && data.rates && data.rates.USD) {
      return 1 / data.rates.USD;
    }
    throw new Error("No se pudo obtener tipo de cambio");
  } catch (err) {
    console.error("Error al obtener tipo de cambio:", err);
    return 3.75;
  }
}

// ===============================
// Función: Calcular rango dinámico
// ===============================
function calcularRangoDinamico(datos) {
  let rango = 0.10;
  rango += Math.min((datos.antig / 5) * 0.005, 0.05);
  if (datos.ascensor === "sin" && datos.piso >= 7) {
    rango += 0.05;
  } else if (datos.ascensor === "con") {
    rango -= 0.02;
  }
  if (datos.dorms >= 3) {
    rango -= 0.02;
  } else if (datos.dorms === 1) {
    rango += 0.03;
  }
  if (datos.tipo.toLowerCase().includes("terreno")) {
    rango += 0.05;
  } else if (datos.tipo.toLowerCase().includes("departamento")) {
    rango -= 0.02;
  } else if (datos.tipo.toLowerCase().includes("oficina")) {
    rango += 0.02;
  } else if (datos.tipo.toLowerCase().includes("local")) {
    rango += 0.03;
  }
  return Math.min(Math.max(rango, 0.08), 0.20);
}

// ===============================
// Funciones de factores
// ===============================
function aplicarFactorAntiguedad(valor, antiguedad) {
  if (antiguedad <= 1) {
    return valor * (1 + FACTORES_TASACION.antiguedad.premiumNuevo);
  }
  const depreciacion = Math.min(
    antiguedad * FACTORES_TASACION.antiguedad.depreciacionAnual,
    FACTORES_TASACION.antiguedad.depreciacionMaxima
  );
  return valor * (1 - depreciacion);
}

function aplicarFactorDormitorios(valor, dormitorios) {
  const { base, incrementoPorDormitorio, decrementoPorDefecto, maximoIncremento } = FACTORES_TASACION.dormitorios;
  if (dormitorios === base) return valor;
  if (dormitorios > base) {
    const incremento = Math.min((dormitorios - base) * incrementoPorDormitorio, maximoIncremento);
    return valor * (1 + incremento);
  } else {
    const decremento = (base - dormitorios) * decrementoPorDefecto;
    return valor * (1 - decremento);
  }
}

function aplicarFactorBanos(valor, banos) {
  const { base, incrementoPorBano, decrementoPorDefecto, maximoIncremento } = FACTORES_TASACION.banos;
  if (banos === base) return valor;
  if (banos > base) {
    const incremento = Math.min((banos - base) * incrementoPorBano, maximoIncremento);
    return valor * (1 + incremento);
  } else {
    const decremento = (base - banos) * decrementoPorDefecto;
    return valor * (1 - decremento);
  }
}

function aplicarFactorPiso(valor, piso, tieneAscensor, tipoInmueble) {
  if (tipoInmueble === "casa" || tipoInmueble === "terreno") {
    return valor; // No aplica para casas ni terrenos
  }

  let factorPiso = 1.0;
  if (piso >= 1 && piso <= 2) {
    factorPiso = 0.92;
  } else if (piso >= 3 && piso <= 8) {
    factorPiso = 1.0;
  } else if (piso >= 9 && piso <= 15) {
    factorPiso = 0.96;
  } else if (piso >= 16) {
    factorPiso = 0.88;
  }

  let factorAscensor = 1.0;
  if (tieneAscensor) {
    factorAscensor *= (1 + 0.10);
    if (piso >= 6) {
      factorAscensor *= (1 + 0.05);
    }
  } else {
    if (piso >= 7) {
      factorAscensor = 0.70;
    } else if (piso >= 4) {
      factorAscensor = 0.85;
    }
  }
  return valor * factorPiso * factorAscensor;
}

function aplicarFactorEficienciaEnergetica(valor, calificacion) {
  const factor = FACTORES_TASACION.eficienciaEnergetica[calificacion] || 1.0;
  return valor * factor;
}

function aplicarFactorEstadoConservacion(valor, estado) {
  const factor = FACTORES_TASACION.estadoConservacion[estado] || 1.0;
  return valor * factor;
}

// ===============================
// Ejecución principal
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const distritoSel = document.getElementById("distrito");
  const zonaSel = document.getElementById("zona");
  const tipoSel = document.getElementById("tipo");
  const form = document.getElementById("calc");

  // Cargar distritos
  Object.keys(DATA).forEach(distrito => {
    const option = document.createElement("option");
    option.value = distrito;
    option.textContent = distrito;
    distritoSel.appendChild(option);
  });

  // Cargar zonas según distrito
  distritoSel.addEventListener("change", () => {
    const distrito = distritoSel.value;
    zonaSel.innerHTML = '<option value="">Selecciona una zona</option>';
    if (DATA[distrito]?.zones) {
      Object.keys(DATA[distrito].zones).forEach(zone => {
        const option = document.createElement("option");
        option.value = zone;
        option.textContent = zone;
        zonaSel.appendChild(option);
      });
    }
  });

  // Ocultar campos según tipo de inmueble
  tipoSel.addEventListener("change", () => {
    const tipo = tipoSel.value.toLowerCase();
    const pisoGroup = document.getElementById("piso-group");
    const ascensorGroup = document.getElementById("ascensor-group");

    if (tipo.includes("departamento")) {
      pisoGroup.style.display = "block";
      ascensorGroup.style.display = "block";
    } else {
      pisoGroup.style.display = "none";
      ascensorGroup.style.display = "none";
    }
  });

  function mostrarError(mensaje) {
    const summary = document.getElementById("summary");
    summary.textContent = `Error: ${mensaje}`;
    summary.style.color = '#e74c3c';
  }

  function limpiarResultados() {
    ['valMin', 'valMed', 'valMax'].forEach(id => {
      document.getElementById(id).textContent = '-';
    });
  }

  function validarInputs(datos) {
    const errores = [];
    if (!datos.distrito || !datos.zona) errores.push("Debe seleccionar distrito y zona");
    if (!datos.tipo) errores.push("Debe seleccionar el tipo de inmueble");
    if (datos.areaT <= 0) errores.push("El área techada debe ser mayor a 0");
    if (datos.areaL < 0) errores.push("El área libre no puede ser negativa");
    if (datos.dorms < 1) errores.push("Debe tener al menos 1 dormitorio");
    if (datos.baths < 1) errores.push("Debe tener al menos 1 baño");
    if (datos.antig < 0) errores.push("La antigüedad no puede ser negativa");
    return errores;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    calcular();
  });

  async function calcular() {
    try {
      limpiarResultados();
      const datos = {
        distrito: distritoSel.value,
        zona: zonaSel.value,
        tipo: document.getElementById("tipo").value.toLowerCase(),
        areaT: parseFloat(document.getElementById("areaTechada").value) || 0,
        areaL: parseFloat(document.getElementById("areaLibre").value) || 0,
        dorms: parseInt(document.getElementById("dorms").value) || 0,
        baths: parseInt(document.getElementById("baths").value) || 0,
        piso: parseInt(document.getElementById("piso").value) || 0,
        ascensor: document.getElementById("ascensor").value,
        antig: parseInt(document.getElementById("antiguedad").value) || 0,
        eficiencia: document.getElementById("eficienciaEnergetica").value,
        estado: document.getElementById("estadoConservacion").value,
        curr: document.getElementById("currency").value
      };

      const errores = validarInputs(datos);
      if (errores.length > 0) {
        mostrarError(errores.join('. '));
        return;
      }

      const precioM2 = DATA[datos.distrito]?.zones?.[datos.zona];
      if (!precioM2) throw new Error("No se encontró precio para la zona seleccionada");

      let factorAreaLibre;
      if (datos.tipo.includes("departamento")) {
        factorAreaLibre = FACTORES_TASACION.areaLibre.departamento;
      } else if (datos.tipo.includes("casa")) {
        factorAreaLibre = FACTORES_TASACION.areaLibre.casa;
      } else if (datos.tipo.includes("terreno")) {
        factorAreaLibre = FACTORES_TASACION.areaLibre.terreno;
      } else {
        factorAreaLibre = FACTORES_TASACION.areaLibre.departamento;
      }

      // Cálculo del área ponderada incluyendo el área de terreno
      const areaPonderada = datos.areaT + (datos.areaL * factorAreaLibre);
      let valorBase = precioM2 * areaPonderada;

      valorBase = aplicarFactorAntiguedad(valorBase, datos.antig);
      valorBase = aplicarFactorDormitorios(valorBase, datos.dorms);
      valorBase = aplicarFactorBanos(valorBase, datos.baths);

      // Aplicar factor de pisos y ascensor solo si es departamento
      if (datos.tipo.includes("departamento")) {
        valorBase = aplicarFactorPiso(valorBase, datos.piso, datos.ascensor === "con", datos.tipo);
      }

      valorBase = aplicarFactorEficienciaEnergetica(valorBase, datos.eficiencia);
      valorBase = aplicarFactorEstadoConservacion(valorBase, datos.estado);

      const tipoKey = datos.tipo.includes("departamento") ? "departamento" :
                      datos.tipo.includes("casa") ? "casa" :
                      datos.tipo.includes("terreno") ? "terreno" :
                      datos.tipo.includes("oficina") ? "oficina" :
                      datos.tipo.includes("local") ? "local" : "departamento";
      valorBase *= FACTORES_TASACION.tipoInmueble[tipoKey] || 1.0;

      const FX_PEN_USD = await obtenerTipoCambio();
      const divisa = datos.curr === "USD" ? "USD" : "S/";
      const factorConversion = datos.curr === "USD" ? (1 / FX_PEN_USD) : 1;

      const rangoVariacion = calcularRangoDinamico(datos);
      const valMin = valorBase * (1 - rangoVariacion);
      const valMax = valorBase * (1 + rangoVariacion);

      const formatearMoneda = (valor) => {
        return new Intl.NumberFormat("es-PE", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(valor);
      };

      document.getElementById("summary").textContent =
        `Estimación para ${datos.tipo} en ${datos.zona}, ${datos.distrito}`;
      document.getElementById("summary").style.color = "#2c3e50";
      document.getElementById("valMin").textContent =
        `${formatearMoneda(valMin * factorConversion)} ${divisa}`;
      document.getElementById("valMed").textContent =
        `${formatearMoneda(valorBase * factorConversion)} ${divisa}`;
      document.getElementById("valMax").textContent =
        `${formatearMoneda(valMax * factorConversion)} ${divisa}`;

    } catch (error) {
      console.error("Error en cálculo:", error);
      mostrarError(error.message || "Error en el cálculo de tasación");
    }
  }
});
