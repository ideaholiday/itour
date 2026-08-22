/**
 * Comprehensive Indian Transit Hubs & Destination Zones Catalog
 * For Airport & Railway Transfers with flexible drop-off zones
 */

export const CITY_HUBS = {
  goa: {
    cityName: "Goa",
    airports: [
      {
        id: "GOX",
        name: "Manohar International Airport, Mopa (GOX)",
        shortName: "Mopa Airport (GOX)",
        address: "Manohar International Airport, Mopa, Pernem, North Goa, 403512",
        lat: 15.7538,
        lng: 73.8643,
        type: "AIRPORT",
        terminal: "Main Terminal"
      },
      {
        id: "GOI",
        name: "Goa Dabolim International Airport (GOI)",
        shortName: "Dabolim Airport (GOI)",
        address: "Goa International Airport, Dabolim, Vasco da Gama, Goa, 403801",
        lat: 15.3808,
        lng: 73.8314,
        type: "AIRPORT",
        terminal: "Terminal 1 & 2"
      }
    ],
    railways: [
      {
        id: "MAO",
        name: "Madgaon Railway Station (MAO)",
        shortName: "Madgaon Station (MAO)",
        address: "Madgaon Railway Station, Margao, South Goa, 403601",
        lat: 15.2742,
        lng: 73.9712,
        type: "RAILWAY"
      },
      {
        id: "THVM",
        name: "Thivim Railway Station (THVM)",
        shortName: "Thivim Station (THVM)",
        address: "Thivim Railway Station, Bardez, North Goa, 403502",
        lat: 15.6318,
        lng: 73.8562,
        type: "RAILWAY"
      },
      {
        id: "KRMI",
        name: "Karmali Railway Station (KRMI)",
        shortName: "Karmali Station (KRMI)",
        address: "Karmali Railway Station, Corlim, Old Goa, 403110",
        lat: 15.4988,
        lng: 73.9189,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "north_goa_beach",
        name: "North Goa (Calangute, Baga, Candolim, Arpora)",
        description: "Covers all hotels, resorts, Airbnbs and home addresses in Calangute, Baga, Candolim, and Arpora belt",
        lat: 15.5439,
        lng: 73.7553,
        avgDistanceKm: 38,
        avgDurationMins: 65
      },
      {
        id: "north_goa_anjuna_vagator",
        name: "North Goa (Anjuna, Vagator, Chapora, Siolim)",
        description: "Covers all accommodations in Anjuna, Vagator, Ozran, Chapora, and Siolim area",
        lat: 15.5869,
        lng: 73.7438,
        avgDistanceKm: 32,
        avgDurationMins: 55
      },
      {
        id: "north_goa_morjim_arambol",
        name: "North Goa (Morjim, Ashwem, Mandrem, Arambol)",
        description: "Covers peaceful North beach hotels and beach shacks across Morjim to Arambol",
        lat: 15.6844,
        lng: 73.7058,
        avgDistanceKm: 28,
        avgDurationMins: 45
      },
      {
        id: "panjim_central_goa",
        name: "Panaji / Central Goa (Panjim, Miramar, Dona Paula, Old Goa)",
        description: "Covers capital city hotels, casino jetties, heritage Latin Quarter Fontainhas and Old Goa",
        lat: 15.4909,
        lng: 73.8278,
        avgDistanceKm: 35,
        avgDurationMins: 50
      },
      {
        id: "south_goa_colva_benaulim",
        name: "South Goa (Colva, Benaulim, Margao, Majorda)",
        description: "Covers all central South Goa resorts, beachfront villas and Margao city",
        lat: 15.2678,
        lng: 73.9156,
        avgDistanceKm: 62,
        avgDurationMins: 85
      },
      {
        id: "south_goa_cavelossim_mobor",
        name: "South Goa Luxury Belt (Cavelossim, Mobor, Varca)",
        description: "Covers 5-star luxury resorts, private villas and beach retreats in Cavelossim and Mobor",
        lat: 15.1764,
        lng: 73.9428,
        avgDistanceKm: 70,
        avgDurationMins: 95
      }
    ]
  },

  delhi: {
    cityName: "Delhi / NCR",
    airports: [
      {
        id: "DEL",
        name: "Indira Gandhi International Airport (DEL) - T1/T2/T3",
        shortName: "Delhi Airport (DEL)",
        address: "Indira Gandhi International Airport, New Delhi, Delhi 110037",
        lat: 28.5562,
        lng: 77.1000,
        type: "AIRPORT",
        terminal: "Terminal 1, 2 & 3"
      }
    ],
    railways: [
      {
        id: "NDLS",
        name: "New Delhi Railway Station (NDLS)",
        shortName: "New Delhi Station (NDLS)",
        address: "Bhavbhuti Marg, Ratan Lal Market, Kamla Market, New Delhi, Delhi 110002",
        lat: 28.6431,
        lng: 77.2197,
        type: "RAILWAY"
      },
      {
        id: "NZM",
        name: "Hazrat Nizamuddin Railway Station (NZM)",
        shortName: "Nizamuddin Station (NZM)",
        address: "Nizamuddin, New Delhi, Delhi 110013",
        lat: 28.5888,
        lng: 77.2534,
        type: "RAILWAY"
      },
      {
        id: "DLI",
        name: "Old Delhi Railway Station (DLI)",
        shortName: "Old Delhi Station (DLI)",
        address: "Chandni Chowk, Old Delhi, Delhi 110006",
        lat: 28.6606,
        lng: 77.2289,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "central_delhi",
        name: "Central Delhi (Connaught Place, Chanakyapuri, India Gate)",
        description: "Covers all central hotels, embassies, diplomatic enclave and Connaught Place",
        lat: 28.6315,
        lng: 77.2167,
        avgDistanceKm: 18,
        avgDurationMins: 40
      },
      {
        id: "south_delhi",
        name: "South Delhi (Hauz Khas, Saket, Greater Kailash, Nehru Place)",
        description: "Covers all premier South Delhi residential and commercial hotel locations",
        lat: 28.5494,
        lng: 77.2001,
        avgDistanceKm: 16,
        avgDurationMins: 35
      },
      {
        id: "gurgaon_dlf",
        name: "Gurgaon / Gurugram (Cyber City, Golf Course Rd, Sector 29)",
        description: "Covers all Millennium City corporate hubs, 5-star hotels and DLF CyberHub",
        lat: 28.4595,
        lng: 77.0266,
        avgDistanceKm: 15,
        avgDurationMins: 30
      },
      {
        id: "noida_expressway",
        name: "Noida & Greater Noida (Sector 18, Expressway, Pari Chowk)",
        description: "Covers Noida City Center, Sector 62 tech parks and Greater Noida expressway hotels",
        lat: 28.5355,
        lng: 77.3910,
        avgDistanceKm: 38,
        avgDurationMins: 60
      }
    ]
  },

  jaipur: {
    cityName: "Jaipur",
    airports: [
      {
        id: "JAI",
        name: "Jaipur International Airport (JAI)",
        shortName: "Jaipur Airport (JAI)",
        address: "Airport Rd, Sanganer, Jaipur, Rajasthan 302029",
        lat: 26.8289,
        lng: 75.8056,
        type: "AIRPORT",
        terminal: "Terminal 2"
      }
    ],
    railways: [
      {
        id: "JP",
        name: "Jaipur Junction Railway Station (JP)",
        shortName: "Jaipur Junction (JP)",
        address: "Gopalbari, Jaipur, Rajasthan 302006",
        lat: 26.9196,
        lng: 75.7878,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "jaipur_pink_city",
        name: "Pink City & Central Jaipur (Hawa Mahal, MI Road, C-Scheme)",
        description: "Covers heritage walled city hotels, havelis, MI Road and C-Scheme boutique stays",
        lat: 26.9124,
        lng: 75.7873,
        avgDistanceKm: 12,
        avgDurationMins: 30
      },
      {
        id: "jaipur_civil_lines",
        name: "Civil Lines, Bani Park & Mansarovar",
        description: "Covers premium residential areas, business hotels and heritage villas",
        lat: 26.9022,
        lng: 75.7766,
        avgDistanceKm: 14,
        avgDurationMins: 35
      },
      {
        id: "jaipur_amer_kukas",
        name: "Amer, Delhi Highway & Kukas Luxury Palaces",
        description: "Covers palace hotels, luxury wedding resorts and heritage forts on Delhi Highway",
        lat: 27.0184,
        lng: 75.8752,
        avgDistanceKm: 32,
        avgDurationMins: 55
      }
    ]
  },

  mumbai: {
    cityName: "Mumbai",
    airports: [
      {
        id: "BOM",
        name: "Chhatrapati Shivaji Maharaj International Airport (BOM)",
        shortName: "Mumbai Airport (BOM - T1/T2)",
        address: "Sahar Rd, Navpada, Vile Parle East, Mumbai, Maharashtra 400099",
        lat: 19.0896,
        lng: 72.8656,
        type: "AIRPORT",
        terminal: "Terminal 1 & 2"
      }
    ],
    railways: [
      {
        id: "CSMT",
        name: "Chhatrapati Shivaji Maharaj Terminus (CSMT)",
        shortName: "CSMT Station",
        address: "Fort, Mumbai, Maharashtra 400001",
        lat: 18.9401,
        lng: 72.8355,
        type: "RAILWAY"
      },
      {
        id: "MMCT",
        name: "Mumbai Central Railway Station (MMCT)",
        shortName: "Mumbai Central",
        address: "Nathani Heights, Mumbai Central, Mumbai, Maharashtra 400008",
        lat: 18.9696,
        lng: 72.8193,
        type: "RAILWAY"
      },
      {
        id: "BDTS",
        name: "Bandra Terminus (BDTS)",
        shortName: "Bandra Terminus",
        address: "Bandra East, Mumbai, Maharashtra 400051",
        lat: 19.0628,
        lng: 72.8406,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "south_mumbai",
        name: "South Mumbai (Colaba, Marine Drive, Nariman Point, Fort)",
        description: "Covers all iconic heritage hotels, Colaba, Marine Drive, and business district",
        lat: 18.9220,
        lng: 72.8347,
        avgDistanceKm: 26,
        avgDurationMins: 55
      },
      {
        id: "bkc_bandra",
        name: "BKC & Bandra (Bandra West, BKC Financial Center, Juhu)",
        description: "Covers upscale western suburbs, Bandra West, Juhu beachfront and BKC hotels",
        lat: 19.0600,
        lng: 72.8600,
        avgDistanceKm: 9,
        avgDurationMins: 25
      },
      {
        id: "andheri_powai",
        name: "Andheri, Powai & Western Suburbs",
        description: "Covers Hiranandani Powai, Andheri East commercial hotels and Goregaon",
        lat: 19.1176,
        lng: 72.9060,
        avgDistanceKm: 8,
        avgDurationMins: 20
      },
      {
        id: "navi_mumbai_thane",
        name: "Navi Mumbai, Vashi & Thane",
        description: "Covers Thane city, Vashi, Belapur and tech parks across Navi Mumbai",
        lat: 19.0771,
        lng: 72.9986,
        avgDistanceKm: 28,
        avgDurationMins: 60
      }
    ]
  },

  lucknow: {
    cityName: "Lucknow",
    airports: [
      {
        id: "LKO",
        name: "Chaudhary Charan Singh International Airport (LKO) - Terminal 3",
        shortName: "Lucknow Airport (LKO)",
        address: "Amausi, Lucknow, Uttar Pradesh 226009",
        lat: 26.7606,
        lng: 80.8893,
        type: "AIRPORT",
        terminal: "Terminal 3 (New Integrated Terminal)"
      }
    ],
    railways: [
      {
        id: "LKO_R",
        name: "Lucknow Charbagh Railway Station (LKO)",
        shortName: "Charbagh Station (LKO)",
        address: "Charbagh, Lucknow, Uttar Pradesh 226004",
        lat: 26.8322,
        lng: 80.9200,
        type: "RAILWAY"
      },
      {
        id: "GTNR",
        name: "Gomti Nagar Railway Station (GTNR)",
        shortName: "Gomti Nagar Station",
        address: "Vibhuti Khand, Gomti Nagar, Lucknow, Uttar Pradesh 226010",
        lat: 26.8627,
        lng: 81.0028,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "lko_hazratganj",
        name: "Hazratganj & Heritage Zone (Chowk, Aminabad, Kaiserbagh)",
        description: "Covers central heritage hotels, Hazratganj shopping boulevard and Chowk",
        lat: 26.8467,
        lng: 80.9462,
        avgDistanceKm: 14,
        avgDurationMins: 30
      },
      {
        id: "lko_gomtinagar",
        name: "Gomti Nagar & Shaheed Path (Vibhuti Khand, Sushant Golf City)",
        description: "Covers all 5-star business hotels, IT City, Ekana Stadium and Shaheed Path",
        lat: 26.8500,
        lng: 81.0100,
        avgDistanceKm: 20,
        avgDurationMins: 35
      },
      {
        id: "lko_alambagh_airport",
        name: "Alambagh, Transport Nagar & Kanpur Road",
        description: "Covers metro corridor, Alambagh bus terminal and commercial hotels",
        lat: 26.8000,
        lng: 80.9000,
        avgDistanceKm: 8,
        avgDurationMins: 15
      }
    ]
  },

  bengaluru: {
    cityName: "Bengaluru / Bangalore",
    airports: [
      {
        id: "BLR",
        name: "Kempegowda International Airport Bengaluru (BLR) - T1/T2",
        shortName: "Bengaluru Airport (BLR)",
        address: "KIAL Rd, Devanahalli, Bengaluru, Karnataka 560300",
        lat: 13.1986,
        lng: 77.7066,
        type: "AIRPORT",
        terminal: "Terminal 1 & 2"
      }
    ],
    railways: [
      {
        id: "SBC",
        name: "KSR Bengaluru City Junction (SBC)",
        shortName: "Bangalore City Station (SBC)",
        address: "Majestic, Bengaluru, Karnataka 560023",
        lat: 12.9781,
        lng: 77.5696,
        type: "RAILWAY"
      },
      {
        id: "YPR",
        name: "Yesvantpur Junction (YPR)",
        shortName: "Yesvantpur Station (YPR)",
        address: "Yesvantpur, Bengaluru, Karnataka 560022",
        lat: 13.0238,
        lng: 77.5501,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "blr_central",
        name: "Central Bengaluru (MG Road, Indiranagar, Koramangala, CBD)",
        description: "Covers all premier central hotels, UB City, Indiranagar and Koramangala",
        lat: 12.9716,
        lng: 77.5946,
        avgDistanceKm: 36,
        avgDurationMins: 65
      },
      {
        id: "blr_whitefield",
        name: "Whitefield, Marathahalli & Outer Ring Road (ORR)",
        description: "Covers IT corridors, tech parks, Marathahalli and luxury business hotels in Whitefield",
        lat: 12.9698,
        lng: 77.7500,
        avgDistanceKm: 42,
        avgDurationMins: 75
      },
      {
        id: "blr_electronic_city",
        name: "Electronic City, Bannerghatta & South Bengaluru",
        description: "Covers Electronic City Phase 1 & 2, JP Nagar and Bannerghatta Road",
        lat: 12.8399,
        lng: 77.6770,
        avgDistanceKm: 54,
        avgDurationMins: 90
      },
      {
        id: "blr_north_hebbal",
        name: "North Bengaluru (Hebbal, Yelahanka, Manyata Tech Park)",
        description: "Covers Manyata Embassy Business Park, Hebbal lake hotels and Yelahanka",
        lat: 13.0358,
        lng: 77.5970,
        avgDistanceKm: 24,
        avgDurationMins: 35
      }
    ]
  },

  agra: {
    cityName: "Agra",
    airports: [
      {
        id: "AGR",
        name: "Agra Airport / Kheria (AGR)",
        shortName: "Agra Airport (AGR)",
        address: "Civil Air Terminal, Kheria, Agra, Uttar Pradesh 282008",
        lat: 27.1558,
        lng: 77.9609,
        type: "AIRPORT"
      }
    ],
    railways: [
      {
        id: "AGC",
        name: "Agra Cantt Railway Station (AGC)",
        shortName: "Agra Cantt (AGC)",
        address: "Idgah Colony, Agra, Uttar Pradesh 282001",
        lat: 27.1578,
        lng: 78.0069,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "agra_tajganj",
        name: "Taj Ganj & Fatehabad Road (Taj Mahal View Hotels)",
        description: "Covers all 5-star luxury resorts, heritage hotels and homestays along Fatehabad Road",
        lat: 27.1650,
        lng: 78.0400,
        avgDistanceKm: 12,
        avgDurationMins: 25
      },
      {
        id: "agra_civil_lines",
        name: "Civil Lines & Agra Fort Area",
        description: "Covers commercial hub, Sanjay Place, Agra Fort area and city centre",
        lat: 27.1900,
        lng: 78.0100,
        avgDistanceKm: 10,
        avgDurationMins: 20
      }
    ]
  },

  kochi: {
    cityName: "Kochi / Cochin",
    airports: [
      {
        id: "COK",
        name: "Cochin International Airport (COK)",
        shortName: "Cochin Airport (COK)",
        address: "Nedumbassery, Kochi, Kerala 683111",
        lat: 10.1557,
        lng: 76.4019,
        type: "AIRPORT"
      }
    ],
    railways: [
      {
        id: "ERS",
        name: "Ernakulam Junction Railway Station (ERS)",
        shortName: "Ernakulam South (ERS)",
        address: "South Railway Station Rd, Ernakulam, Kochi, Kerala 682016",
        lat: 9.9678,
        lng: 76.2907,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "fort_kochi",
        name: "Fort Kochi & Mattancherry Heritage",
        description: "Covers colonial heritage hotels, Jewish Town, spice markets and Chinese fishing nets area",
        lat: 9.9658,
        lng: 76.2421,
        avgDistanceKm: 42,
        avgDurationMins: 75
      },
      {
        id: "ernakulam_city",
        name: "Ernakulam City, Marine Drive & MG Road",
        description: "Covers prime downtown hotels, shopping avenues and Marine Drive waterfront",
        lat: 9.9816,
        lng: 76.2799,
        avgDistanceKm: 32,
        avgDurationMins: 55
      }
    ]
  },

  varanasi: {
    cityName: "Varanasi",
    airports: [
      {
        id: "VNS",
        name: "Lal Bahadur Shastri International Airport (VNS)",
        shortName: "Varanasi Airport (VNS)",
        address: "Babatpur, Varanasi, Uttar Pradesh 221006",
        lat: 25.4524,
        lng: 82.8587,
        type: "AIRPORT"
      }
    ],
    railways: [
      {
        id: "BSB",
        name: "Varanasi Junction / Cantt (BSB)",
        shortName: "Varanasi Junction (BSB)",
        address: "Cantonment, Varanasi, Uttar Pradesh 221002",
        lat: 25.3283,
        lng: 82.9866,
        type: "RAILWAY"
      }
    ],
    popularZones: [
      {
        id: "varanasi_ghats",
        name: "Dashashwamedh, Assi Ghat & Old City Hotels",
        description: "Covers riverfront heritage hotels, ghat walkways, Kashi Vishwanath corridor and Assi Ghat",
        lat: 25.3050,
        lng: 83.0100,
        avgDistanceKm: 26,
        avgDurationMins: 50
      },
      {
        id: "varanasi_cantonment",
        name: "Varanasi Cantonment & Mall Road",
        description: "Covers 5-star chain hotels, leafy cantonment enclave and luxury properties",
        lat: 25.3350,
        lng: 82.9800,
        avgDistanceKm: 22,
        avgDurationMins: 40
      }
    ]
  }
};

/**
 * Normalizes city string and returns matching hub suggestions
 */
export function getHubsForCity(cityName) {
  if (!cityName) return null;
  const clean = String(cityName).trim().toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, data] of Object.entries(CITY_HUBS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return data;
    }
  }
  return null;
}
