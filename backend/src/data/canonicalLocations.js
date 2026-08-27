// Stable, curated anchors used for deterministic validation and as an offline
// fallback when Mappls is unavailable. IDs are deliberately human-readable so
// migrations and supplier-authored rules remain portable across databases.
export const CANONICAL_LOCATIONS = [
  ["airport_gox", "Manohar International Airport, Mopa (GOX)", "Mopa Airport", "GOX", "AIRPORT", "North Goa", "Goa", 15.7538, 73.8643, 3],
  ["airport_goi", "Goa International Airport, Dabolim (GOI)", "Dabolim Airport", "GOI", "AIRPORT", "Goa", "Goa", 15.3808, 73.8314, 3],
  ["airport_del", "Indira Gandhi International Airport (DEL)", "Delhi Airport", "DEL", "AIRPORT", "New Delhi", "Delhi", 28.5562, 77.1000, 4],
  ["airport_bom", "Chhatrapati Shivaji Maharaj International Airport (BOM)", "Mumbai Airport", "BOM", "AIRPORT", "Mumbai", "Maharashtra", 19.0896, 72.8656, 4],
  ["airport_blr", "Kempegowda International Airport (BLR)", "Bengaluru Airport", "BLR", "AIRPORT", "Bengaluru", "Karnataka", 13.1986, 77.7066, 4],
  ["airport_maa", "Chennai International Airport (MAA)", "Chennai Airport", "MAA", "AIRPORT", "Chennai", "Tamil Nadu", 12.9941, 80.1709, 4],
  ["airport_ccu", "Netaji Subhas Chandra Bose International Airport (CCU)", "Kolkata Airport", "CCU", "AIRPORT", "Kolkata", "West Bengal", 22.6547, 88.4467, 4],
  ["airport_hyd", "Rajiv Gandhi International Airport (HYD)", "Hyderabad Airport", "HYD", "AIRPORT", "Hyderabad", "Telangana", 17.2403, 78.4294, 4],
  ["airport_cok", "Cochin International Airport (COK)", "Kochi Airport", "COK", "AIRPORT", "Kochi", "Kerala", 10.1520, 76.4019, 4],
  ["airport_pnq", "Pune International Airport (PNQ)", "Pune Airport", "PNQ", "AIRPORT", "Pune", "Maharashtra", 18.5821, 73.9197, 3],
  ["airport_amd", "Sardar Vallabhbhai Patel International Airport (AMD)", "Ahmedabad Airport", "AMD", "AIRPORT", "Ahmedabad", "Gujarat", 23.0772, 72.6347, 4],
  ["airport_jai", "Jaipur International Airport (JAI)", "Jaipur Airport", "JAI", "AIRPORT", "Jaipur", "Rajasthan", 26.8289, 75.8056, 3],
  ["airport_lko", "Chaudhary Charan Singh International Airport (LKO)", "Lucknow Airport", "LKO", "AIRPORT", "Lucknow", "Uttar Pradesh", 26.7606, 80.8893, 3],
  ["airport_vns", "Lal Bahadur Shastri International Airport (VNS)", "Varanasi Airport", "VNS", "AIRPORT", "Varanasi", "Uttar Pradesh", 25.4524, 82.8593, 3],
  ["airport_atq", "Sri Guru Ram Dass Jee International Airport (ATQ)", "Amritsar Airport", "ATQ", "AIRPORT", "Amritsar", "Punjab", 31.7096, 74.7973, 3],
  ["airport_uda", "Maharana Pratap Airport (UDR)", "Udaipur Airport", "UDR", "AIRPORT", "Udaipur", "Rajasthan", 24.6177, 73.8961, 3],
  ["airport_ixc", "Shaheed Bhagat Singh International Airport (IXC)", "Chandigarh Airport", "IXC", "AIRPORT", "Chandigarh", "Chandigarh", 30.6735, 76.7885, 3],
  ["airport_gaa", "Gaya Airport (GAY)", "Gaya Airport", "GAY", "AIRPORT", "Gaya", "Bihar", 24.7443, 84.9512, 3],
  ["airport_ixb", "Bagdogra Airport (IXB)", "Bagdogra Airport", "IXB", "AIRPORT", "Siliguri", "West Bengal", 26.6812, 88.3286, 3],
  ["airport_guw", "Lokpriya Gopinath Bordoloi International Airport (GAU)", "Guwahati Airport", "GAU", "AIRPORT", "Guwahati", "Assam", 26.1061, 91.5859, 4],
  ["airport_sxr", "Sheikh ul-Alam International Airport (SXR)", "Srinagar Airport", "SXR", "AIRPORT", "Srinagar", "Jammu and Kashmir", 33.9871, 74.7743, 3],
  ["airport_ded", "Dehradun Jolly Grant Airport (DED)", "Dehradun Airport", "DED", "AIRPORT", "Dehradun", "Uttarakhand", 30.1897, 78.1803, 3],
  ["airport_ixl", "Kushok Bakula Rimpochee Airport (IXL)", "Leh Airport", "IXL", "AIRPORT", "Leh", "Ladakh", 34.1359, 77.5465, 3],
  ["airport_trv", "Thiruvananthapuram International Airport (TRV)", "Trivandrum Airport", "TRV", "AIRPORT", "Thiruvananthapuram", "Kerala", 8.4821, 76.9200, 3],
  ["airport_ixm", "Madurai Airport (IXM)", "Madurai Airport", "IXM", "AIRPORT", "Madurai", "Tamil Nadu", 9.8345, 78.0934, 3],
  ["airport_bbi", "Biju Patnaik International Airport (BBI)", "Bhubaneswar Airport", "BBI", "AIRPORT", "Bhubaneswar", "Odisha", 20.2444, 85.8178, 3],
  ["airport_idr", "Devi Ahilya Bai Holkar Airport (IDR)", "Indore Airport", "IDR", "AIRPORT", "Indore", "Madhya Pradesh", 22.7218, 75.8011, 3],
  ["airport_nag", "Dr. Babasaheb Ambedkar International Airport (NAG)", "Nagpur Airport", "NAG", "AIRPORT", "Nagpur", "Maharashtra", 21.0922, 79.0472, 3],
  ["airport_raj", "Rajkot International Airport (HSR)", "Rajkot Airport", "HSR", "AIRPORT", "Rajkot", "Gujarat", 22.3789, 71.0394, 3],
  ["airport_ixe", "Mangaluru International Airport (IXE)", "Mangaluru Airport", "IXE", "AIRPORT", "Mangaluru", "Karnataka", 12.9613, 74.8901, 3],
  ["airport_pat", "Jay Prakash Narayan Airport (PAT)", "Patna Airport", "PAT", "AIRPORT", "Patna", "Bihar", 25.5913, 85.0880, 3],
  ["airport_rpr", "Swami Vivekananda Airport (RPR)", "Raipur Airport", "RPR", "AIRPORT", "Raipur", "Chhattisgarh", 21.1804, 81.7388, 3],
  ["airport_bho", "Raja Bhoj Airport (BHO)", "Bhopal Airport", "BHO", "AIRPORT", "Bhopal", "Madhya Pradesh", 23.2875, 77.3374, 3],
  ["airport_jdh", "Jodhpur Airport (JDH)", "Jodhpur Airport", "JDH", "AIRPORT", "Jodhpur", "Rajasthan", 26.2511, 73.0489, 3],
  ["airport_jsa", "Jaisalmer Airport (JSA)", "Jaisalmer Airport", "JSA", "AIRPORT", "Jaisalmer", "Rajasthan", 26.8887, 70.8650, 3],
  ["airport_ixj", "Jammu Airport (IXJ)", "Jammu Airport", "IXJ", "AIRPORT", "Jammu", "Jammu and Kashmir", 32.6891, 74.8374, 3],
  ["airport_dhm", "Kangra Airport, Dharamshala (DHM)", "Dharamshala Airport", "DHM", "AIRPORT", "Dharamshala", "Himachal Pradesh", 32.1651, 76.2634, 3],
  ["airport_kuu", "Kullu-Manali Airport (KUU)", "Bhuntar Airport", "KUU", "AIRPORT", "Kullu", "Himachal Pradesh", 31.8767, 77.1544, 3],
  ["airport_shl", "Shillong Airport (SHL)", "Shillong Airport", "SHL", "AIRPORT", "Shillong", "Meghalaya", 25.7036, 91.9787, 3],
  ["airport_imf", "Imphal International Airport (IMF)", "Imphal Airport", "IMF", "AIRPORT", "Imphal", "Manipur", 24.7600, 93.8967, 3],
  ["airport_ajl", "Lengpui Airport (AJL)", "Aizawl Airport", "AJL", "AIRPORT", "Aizawl", "Mizoram", 23.8406, 92.6197, 3],
  ["airport_dmu", "Dimapur Airport (DMU)", "Dimapur Airport", "DMU", "AIRPORT", "Dimapur", "Nagaland", 25.8839, 93.7711, 3],
  ["airport_vtz", "Visakhapatnam International Airport (VTZ)", "Visakhapatnam Airport", "VTZ", "AIRPORT", "Visakhapatnam", "Andhra Pradesh", 17.7212, 83.2245, 3],
  ["airport_vga", "Vijayawada International Airport (VGA)", "Vijayawada Airport", "VGA", "AIRPORT", "Vijayawada", "Andhra Pradesh", 16.5304, 80.7968, 3],
  ["airport_tir", "Tirupati Airport (TIR)", "Tirupati Airport", "TIR", "AIRPORT", "Tirupati", "Andhra Pradesh", 13.6325, 79.5433, 3],
  ["airport_trz", "Tiruchirappalli International Airport (TRZ)", "Trichy Airport", "TRZ", "AIRPORT", "Tiruchirappalli", "Tamil Nadu", 10.7654, 78.7097, 3],
  ["airport_cjb", "Coimbatore International Airport (CJB)", "Coimbatore Airport", "CJB", "AIRPORT", "Coimbatore", "Tamil Nadu", 11.0300, 77.0434, 3],
  ["airport_ccj", "Calicut International Airport (CCJ)", "Kozhikode Airport", "CCJ", "AIRPORT", "Kozhikode", "Kerala", 11.1368, 75.9553, 3],
  ["airport_cnn", "Kannur International Airport (CNN)", "Kannur Airport", "CNN", "AIRPORT", "Kannur", "Kerala", 11.9186, 75.5472, 3],
  ["airport_myq", "Mysuru Airport (MYQ)", "Mysuru Airport", "MYQ", "AIRPORT", "Mysuru", "Karnataka", 12.2308, 76.6558, 3],
  ["airport_hbx", "Hubballi Airport (HBX)", "Hubballi Airport", "HBX", "AIRPORT", "Hubballi", "Karnataka", 15.3617, 75.0849, 3],
  ["airport_bdq", "Vadodara Airport (BDQ)", "Vadodara Airport", "BDQ", "AIRPORT", "Vadodara", "Gujarat", 22.3362, 73.2263, 3],
  ["airport_stv", "Surat International Airport (STV)", "Surat Airport", "STV", "AIRPORT", "Surat", "Gujarat", 21.1141, 72.7418, 3],
  ["airport_jlr", "Jabalpur Airport (JLR)", "Jabalpur Airport", "JLR", "AIRPORT", "Jabalpur", "Madhya Pradesh", 23.1778, 80.0520, 3],
  ["airport_gwl", "Gwalior Airport (GWL)", "Gwalior Airport", "GWL", "AIRPORT", "Gwalior", "Madhya Pradesh", 26.2937, 78.2278, 3],
  ["airport_ixr", "Birsa Munda Airport (IXR)", "Ranchi Airport", "IXR", "AIRPORT", "Ranchi", "Jharkhand", 23.3143, 85.3217, 3],
  ["airport_dib", "Dibrugarh Airport (DIB)", "Dibrugarh Airport", "DIB", "AIRPORT", "Dibrugarh", "Assam", 27.4839, 95.0169, 3],
  ["airport_jrh", "Jorhat Airport (JRH)", "Jorhat Airport", "JRH", "AIRPORT", "Jorhat", "Assam", 26.7315, 94.1755, 3],
  ["airport_ixa", "Maharaja Bir Bikram Airport (IXA)", "Agartala Airport", "IXA", "AIRPORT", "Agartala", "Tripura", 23.8869, 91.2405, 3],
  ["airport_ixz", "Veer Savarkar International Airport (IXZ)", "Port Blair Airport", "IXZ", "AIRPORT", "Port Blair", "Andaman and Nicobar Islands", 11.6412, 92.7297, 3],
  ["airport_pbd", "Porbandar Airport (PBD)", "Porbandar Airport", "PBD", "AIRPORT", "Porbandar", "Gujarat", 21.6487, 69.6572, 3],
  ["airport_bhj", "Bhuj Airport (BHJ)", "Bhuj Airport", "BHJ", "AIRPORT", "Bhuj", "Gujarat", 23.2878, 69.6702, 3],
  ["airport_ixu", "Chhatrapati Sambhajinagar Airport (IXU)", "Aurangabad Airport", "IXU", "AIRPORT", "Chhatrapati Sambhajinagar", "Maharashtra", 19.8627, 75.3981, 3],
  ["airport_klh", "Kolhapur Airport (KLH)", "Kolhapur Airport", "KLH", "AIRPORT", "Kolhapur", "Maharashtra", 16.6647, 74.2894, 3],
  ["airport_isk", "Nashik Airport (ISK)", "Nashik Airport", "ISK", "AIRPORT", "Nashik", "Maharashtra", 20.1190, 73.9129, 3],
  ["airport_jrg", "Veer Surendra Sai Airport (JRG)", "Jharsuguda Airport", "JRG", "AIRPORT", "Jharsuguda", "Odisha", 21.9135, 84.0504, 3],
  ["airport_sag", "Shirdi Airport (SAG)", "Shirdi Airport", "SAG", "AIRPORT", "Shirdi", "Maharashtra", 19.6888, 74.3789, 3],
  ["airport_ayj", "Maharishi Valmiki International Airport, Ayodhya (AYJ)", "Ayodhya Airport", "AYJ", "AIRPORT", "Ayodhya", "Uttar Pradesh", 26.7513, 82.1559, 3],
  ["airport_pyg", "Pakyong Airport (PYG)", "Pakyong Airport", "PYG", "AIRPORT", "Gangtok", "Sikkim", 27.2273, 88.5872, 3],
  ["airport_dbr", "Donyi Polo Airport (HGI)", "Itanagar Airport", "HGI", "AIRPORT", "Itanagar", "Arunachal Pradesh", 26.9668, 93.6377, 3],
  ["rail_mao", "Madgaon Railway Station (MAO)", "Madgaon Station", null, "RAILWAY_STATION", "South Goa", "Goa", 15.2742, 73.9712, 2],
  ["rail_thvm", "Thivim Railway Station (THVM)", "Thivim Station", null, "RAILWAY_STATION", "North Goa", "Goa", 15.6318, 73.8562, 2],
  ["rail_krmi", "Karmali Railway Station (KRMI)", "Karmali Station", null, "RAILWAY_STATION", "Goa", "Goa", 15.4988, 73.9189, 2],
  ["rail_ndls", "New Delhi Railway Station (NDLS)", "New Delhi Station", null, "RAILWAY_STATION", "New Delhi", "Delhi", 28.6431, 77.2197, 2],
  ["rail_nzm", "Hazrat Nizamuddin Railway Station (NZM)", "Nizamuddin Station", null, "RAILWAY_STATION", "New Delhi", "Delhi", 28.5888, 77.2534, 2],
  ["rail_csmt", "Chhatrapati Shivaji Maharaj Terminus (CSMT)", "CSMT", null, "RAILWAY_STATION", "Mumbai", "Maharashtra", 18.9401, 72.8355, 2],
  ["zone_north_goa", "North Goa Hotels", "North Goa Hotels", null, "HOTEL_ZONE", "North Goa", "Goa", 15.5439, 73.7553, 40],
  ["zone_calangute", "Calangute, Baga and Candolim Hotels", "Calangute Hotel Belt", null, "HOTEL_ZONE", "North Goa", "Goa", 15.5450, 73.7523, 8],
  ["zone_anjuna", "Anjuna, Vagator and Chapora Hotels", "Anjuna Hotel Belt", null, "HOTEL_ZONE", "North Goa", "Goa", 15.5869, 73.7438, 8],
  ["zone_morjim", "Morjim, Mandrem and Arambol Hotels", "Morjim Hotel Belt", null, "HOTEL_ZONE", "North Goa", "Goa", 15.6844, 73.7058, 12],
  ["zone_south_goa", "South Goa Hotels", "South Goa Hotels", null, "HOTEL_ZONE", "South Goa", "Goa", 15.2678, 73.9156, 45],
  ["city_panaji", "Panaji City Center", "Panaji", null, "CITY_CENTER", "Panaji", "Goa", 15.4909, 73.8278, 5],
  ["port_mormugao", "Mormugao Cruise Port", "Mormugao Port", null, "CRUISE_PORT", "Vasco da Gama", "Goa", 15.4070, 73.7990, 3],
];

export function seedCanonicalLocations(db) {
  const insert = db.prepare(`
    INSERT INTO canonical_locations (
      id, name, short_name, iata_code, location_type, city, state, country,
      lat, lng, radius_km, aliases, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'India', ?, ?, ?, '[]', TRUE)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, short_name = excluded.short_name,
      iata_code = excluded.iata_code, location_type = excluded.location_type,
      city = excluded.city, state = excluded.state, lat = excluded.lat,
      lng = excluded.lng, radius_km = excluded.radius_km, is_active = TRUE
  `);
  const sync = db.transaction(() => {
    for (const row of CANONICAL_LOCATIONS) insert.run(...row);
  });
  sync();
}

export function backfillProductLocationRules(db) {
  const products = db.prepare("SELECT * FROM products").all();
  const existing = new Set(db.prepare("SELECT product_id || ':' || rule_side AS key FROM product_location_rules").all().map((row) => row.key));
  const insert = db.prepare(`
    INSERT INTO product_location_rules (
      id, product_id, rule_side, rule_mode, fixed_location_id,
      allowed_location_types, center_lat, center_lng, radius_km,
      allowed_state, allowed_city, polygon_coordinates, error_message,
      suggestion, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, TRUE)
    ON CONFLICT(product_id, rule_side) DO NOTHING
  `);
  const sync = db.transaction(() => {
    for (const product of products) {
      if (product.product_type === "TRANSFER") {
        const route = db.prepare("SELECT * FROM transfer_routes WHERE product_id = ? LIMIT 1").get(product.id);
        if (!route) continue;
        const routeType = String(route.route_type || "POINT_TO_POINT").toUpperCase();
        for (const side of ["PICKUP", "DROP"]) {
          if (existing.has(`${product.id}:${side}`)) continue;
          const prefix = side === "PICKUP" ? "origin" : "dest";
          const isFixed = (side === "PICKUP" && routeType.endsWith("_PICKUP")) || (side === "DROP" && routeType.endsWith("_DROP"));
          const iataMatch = String(route[`${prefix}_name`] || "").match(/\(([A-Z0-9]{3})\)/);
          const anchor = iataMatch ? db.prepare("SELECT id, location_type FROM canonical_locations WHERE iata_code = ? LIMIT 1").get(iataMatch[1]) : null;
          if (anchor) {
            try { db.prepare(`UPDATE transfer_routes SET ${prefix}_iata = ?, ${prefix}_location_id = ? WHERE id = ?`).run(iataMatch[1], anchor.id, route.id); } catch {}
          }
          const area = route[`${prefix}_name`] || product.city;
          insert.run(
            `plr_auto_${product.id}_${side.toLowerCase()}`, product.id, side,
            isFixed ? "FIXED_LOCATION" : "RADIUS_FROM_CENTER", isFixed ? anchor?.id || null : null,
            isFixed ? JSON.stringify([anchor?.location_type || (routeType.includes("AIRPORT") ? "AIRPORT" : "RAILWAY_STATION")]) : "[]",
            route[`${prefix}_lat`], route[`${prefix}_lng`], isFixed ? 3 : Number(route[`${prefix}_radius_km`] || 25),
            product.state, product.city,
            `This ${side === "PICKUP" ? "pickup" : "drop-off"} is outside ${area}.`,
            `Choose a valid ${side === "PICKUP" ? "pickup" : "drop-off"} point within ${area}.`,
          );
        }
      } else {
        const pkg = product.product_type === "MULTI_DAY_PACKAGE"
          ? db.prepare("SELECT * FROM package_itineraries WHERE product_id = ? LIMIT 1").get(product.id) : null;
        for (const side of ["PICKUP", "DROP"]) {
          if (existing.has(`${product.id}:${side}`)) continue;
          const city = product.product_type === "MULTI_DAY_PACKAGE"
            ? (side === "PICKUP" ? pkg?.start_city : pkg?.end_city) || product.city : product.city;
          const types = product.product_type === "MULTI_DAY_PACKAGE" ? ["AIRPORT", "RAILWAY_STATION"] : [];
          insert.run(
            `plr_auto_${product.id}_${side.toLowerCase()}`, product.id, side, "CITY_ANYWHERE", null,
            JSON.stringify(types), null, null, product.product_type === "DAY_TOUR" ? 80 : null,
            product.state, city,
            `This ${side === "PICKUP" ? "pickup" : "drop-off"} is outside ${city}.`,
            `Choose a valid ${side === "PICKUP" ? "pickup" : "drop-off"} point in ${city}.`,
          );
        }
      }
    }
  });
  sync();
}
