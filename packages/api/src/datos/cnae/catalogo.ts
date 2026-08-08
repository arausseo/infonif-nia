/**
 * Subconjunto curado de CNAE-2009 a cuatro dígitos.
 *
 * Esto NO es el corpus semántico: el corpus completo (~630 clases) vive en
 * `packages/semantica` y se usa para generar embeddings en tiempo de compilación
 * (ADR-004). Aquí solo hay lo necesario para que los fixtures tengan actividades
 * verosímiles y para que el demo tenga contra qué contar.
 */

export interface EntradaCnae {
  readonly codigo: string;
  readonly descripcion: string;
  readonly sector: Sector;
}

export type Sector =
  | "transporte y logística"
  | "comercio"
  | "construcción e inmobiliario"
  | "hostelería"
  | "tecnología"
  | "servicios profesionales"
  | "servicios a empresas"
  | "sanidad"
  | "agroalimentario"
  | "textil y calzado"
  | "industria manufacturera"
  | "energía y medio ambiente";

// Tabla de datos: se lee mejor a una línea por código.
// prettier-ignore
export const CATALOGO_CNAE: readonly EntradaCnae[] = [
  // Transporte y logística — los tres primeros son los que debe devolver
  // resolverActividad("logística") según el criterio de aceptación de la Fase 2.
  { codigo: "4941", descripcion: "Transporte de mercancías por carretera", sector: "transporte y logística" },
  { codigo: "5210", descripcion: "Depósito y almacenamiento", sector: "transporte y logística" },
  { codigo: "5229", descripcion: "Otras actividades anexas al transporte", sector: "transporte y logística" },
  { codigo: "4942", descripcion: "Servicios de mudanza", sector: "transporte y logística" },
  { codigo: "5224", descripcion: "Manipulación de mercancías", sector: "transporte y logística" },
  { codigo: "5320", descripcion: "Otras actividades postales y de correos", sector: "transporte y logística" },
  { codigo: "5040", descripcion: "Transporte de mercancías por vías navegables interiores", sector: "transporte y logística" },

  // Comercio
  { codigo: "4631", descripcion: "Comercio al por mayor de frutas y hortalizas", sector: "comercio" },
  { codigo: "4639", descripcion: "Comercio al por mayor no especializado de productos alimenticios, bebidas y tabaco", sector: "comercio" },
  { codigo: "4652", descripcion: "Comercio al por mayor de equipos electrónicos y de telecomunicaciones", sector: "comercio" },
  { codigo: "4711", descripcion: "Comercio al por menor con predominio en productos alimenticios", sector: "comercio" },
  { codigo: "4771", descripcion: "Comercio al por menor de prendas de vestir", sector: "comercio" },
  { codigo: "4520", descripcion: "Mantenimiento y reparación de vehículos de motor", sector: "comercio" },

  // Construcción e inmobiliario
  { codigo: "4110", descripcion: "Promoción inmobiliaria", sector: "construcción e inmobiliario" },
  { codigo: "4121", descripcion: "Construcción de edificios residenciales", sector: "construcción e inmobiliario" },
  { codigo: "4321", descripcion: "Instalaciones eléctricas", sector: "construcción e inmobiliario" },
  { codigo: "4322", descripcion: "Fontanería, instalaciones de calefacción y aire acondicionado", sector: "construcción e inmobiliario" },
  { codigo: "6820", descripcion: "Alquiler de bienes inmobiliarios por cuenta propia", sector: "construcción e inmobiliario" },

  // Hostelería
  { codigo: "5510", descripcion: "Hoteles y alojamientos similares", sector: "hostelería" },
  { codigo: "5610", descripcion: "Restaurantes y puestos de comidas", sector: "hostelería" },
  { codigo: "5630", descripcion: "Establecimientos de bebidas", sector: "hostelería" },

  // Tecnología
  { codigo: "6201", descripcion: "Actividades de programación informática", sector: "tecnología" },
  { codigo: "6202", descripcion: "Actividades de consultoría informática", sector: "tecnología" },
  { codigo: "6209", descripcion: "Otros servicios relacionados con las tecnologías de la información", sector: "tecnología" },
  { codigo: "6311", descripcion: "Proceso de datos, hosting y actividades relacionadas", sector: "tecnología" },

  // Servicios profesionales
  { codigo: "6910", descripcion: "Actividades jurídicas", sector: "servicios profesionales" },
  { codigo: "6920", descripcion: "Contabilidad, auditoría y asesoría fiscal", sector: "servicios profesionales" },
  { codigo: "7022", descripcion: "Otras actividades de consultoría de gestión empresarial", sector: "servicios profesionales" },
  { codigo: "7112", descripcion: "Servicios técnicos de ingeniería", sector: "servicios profesionales" },
  { codigo: "7311", descripcion: "Agencias de publicidad", sector: "servicios profesionales" },

  // Servicios a empresas
  { codigo: "7820", descripcion: "Actividades de las empresas de trabajo temporal", sector: "servicios a empresas" },
  { codigo: "8010", descripcion: "Actividades de seguridad privada", sector: "servicios a empresas" },
  { codigo: "8121", descripcion: "Limpieza general de edificios", sector: "servicios a empresas" },
  { codigo: "8299", descripcion: "Otras actividades de apoyo a las empresas", sector: "servicios a empresas" },

  // Sanidad
  { codigo: "8610", descripcion: "Actividades hospitalarias", sector: "sanidad" },
  { codigo: "8623", descripcion: "Actividades odontológicas", sector: "sanidad" },
  { codigo: "8690", descripcion: "Otras actividades sanitarias", sector: "sanidad" },

  // Agroalimentario
  { codigo: "0113", descripcion: "Cultivo de hortalizas, raíces y tubérculos", sector: "agroalimentario" },
  { codigo: "0146", descripcion: "Explotación de ganado porcino", sector: "agroalimentario" },
  { codigo: "1071", descripcion: "Fabricación de pan y productos frescos de panadería", sector: "agroalimentario" },
  { codigo: "1082", descripcion: "Fabricación de cacao, chocolate y productos de confitería", sector: "agroalimentario" },
  { codigo: "1102", descripcion: "Elaboración de vinos", sector: "agroalimentario" },

  // Textil y calzado
  { codigo: "1413", descripcion: "Confección de otras prendas de vestir exteriores", sector: "textil y calzado" },
  { codigo: "1520", descripcion: "Fabricación de calzado", sector: "textil y calzado" },

  // Industria manufacturera
  { codigo: "2223", descripcion: "Fabricación de productos de plástico para la construcción", sector: "industria manufacturera" },
  { codigo: "2331", descripcion: "Fabricación de azulejos y baldosas de cerámica", sector: "industria manufacturera" },
  { codigo: "2511", descripcion: "Fabricación de estructuras metálicas y sus componentes", sector: "industria manufacturera" },
  { codigo: "2932", descripcion: "Fabricación de componentes y accesorios para vehículos de motor", sector: "industria manufacturera" },
  { codigo: "3101", descripcion: "Fabricación de muebles de oficina y establecimientos comerciales", sector: "industria manufacturera" },
  { codigo: "3320", descripcion: "Instalación de máquinas y equipos industriales", sector: "industria manufacturera" },

  // Energía y medio ambiente
  { codigo: "3511", descripcion: "Producción de energía eléctrica", sector: "energía y medio ambiente" },
  { codigo: "3821", descripcion: "Tratamiento y eliminación de residuos no peligrosos", sector: "energía y medio ambiente" },
];

const POR_CODIGO = new Map(CATALOGO_CNAE.map((e) => [e.codigo, e]));

export function cnaePorCodigo(codigo: string): EntradaCnae | undefined {
  return POR_CODIGO.get(codigo);
}

export function cnaesDeSector(sector: Sector): readonly EntradaCnae[] {
  return CATALOGO_CNAE.filter((e) => e.sector === sector);
}
