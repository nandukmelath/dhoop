/**
 * Solar vendors a household or a small developer can ring, for anywhere in India.
 *
 * These are vendors registered on the national rooftop solar portal, pmsuryaghar.gov.in, under
 * "Registered vendors", with the contact number, the consumers' rating and the installation
 * figures the portal shows for each. They were read in a browser, the way a visitor reads
 * them, on 20 Nov 2026. There are two kinds of list here:
 *
 * - A district's own list: the six vendors with the most installations in that district. Two
 *   districts were read this way.
 * - A state's list, for each of the 28 states and 8 union territories: the vendors with the
 *   most installations in the whole state. The portal will not list vendors without a
 *   district, so each was read under the state's main district with the list ordered by
 *   installations across the state; the figures are the state's. These vendors are the state's
 *   busiest, which is not the same as the nearest, and Dhoop says so.
 *
 * `vendorsFor` gives the district's list where there is one and the state's otherwise, so no
 * place in the country comes back empty.
 *
 * Why a dated copy and not a live lookup: the portal's list sits behind its own access check,
 * and a server that got round that check would be doing something the portal has asked not to
 * be done. So this is what any visitor sees, with its source and its date. A portal that
 * offered the list openly would let this file go.
 *
 * What was left out on purpose: the contact person's name and email. Where the portal's
 * "vendor name" was a person's own name and nothing else, the entry was passed over, and a
 * proprietor's name tacked on to a business name was dropped. Vendors the portal shows with no
 * installation in the state were passed over too, which is why a few lists are short.
 *
 * They are rooftop vendors, registered for the subsidy scheme. Many also build ground plants,
 * but a megawatt is a different job: the person should ask. And it is a list, not a
 * recommendation: nobody here has checked their work.
 *
 * Safe to import from a screen: plain data.
 */

export interface Vendor {
  name: string;
  /** The contact number the portal publishes for the vendor. */
  phone: string;
  /** Consumers' rating out of 5 on the portal, and how many rated. Nought and nought where nobody has yet. */
  rating: number;
  ratings: number;
  /** Installations and their capacity in kWp, as the portal shows them: in the district for a district's list, across the state for a state's. */
  installs: number;
  kwp: number;
}

export interface VendorList {
  /** How local the list is. */
  scope: 'district' | 'state';
  /** The district or the state it is for. */
  place: string;
  /** The state: the district's own, or the same as `place`. */
  state: string;
  /** For a state's list, the district it was read under. */
  via?: string;
  readOn: string;
  vendors: Vendor[];
}

export const VENDOR_SOURCE = 'https://pmsuryaghar.gov.in/#/registered-vendors';
const READ_ON = '20 Nov 2026';

const DISTRICTS: VendorList[] = [
  {
    scope: 'district',
    place: 'Kasaragod',
    state: 'Kerala',
    readOn: READ_ON,
    vendors: [
      { name: 'Global Technology', phone: '9995492345', rating: 5, ratings: 641, installs: 709, kwp: 2365 },
      { name: 'Battery Shoppe', phone: '9995667073', rating: 5, ratings: 613, installs: 690, kwp: 2524 },
      { name: 'Puncha In', phone: '9946752891', rating: 5, ratings: 504, installs: 585, kwp: 2614 },
      { name: 'GEPS Energy India Private Limited', phone: '8547655673', rating: 5, ratings: 2162, installs: 464, kwp: 1736 },
      { name: 'Refftech Service Centre', phone: '9349774174', rating: 4.8, ratings: 419, installs: 455, kwp: 1697 },
      { name: 'Powergilty Solar Solution', phone: '9497479887', rating: 5, ratings: 527, installs: 341, kwp: 1271 },
    ],
  },
  {
    scope: 'district',
    place: 'Bengaluru Urban',
    state: 'Karnataka',
    readOn: READ_ON,
    vendors: [
      { name: 'SolarSquare', phone: '9830003000', rating: 4.9, ratings: 52711, installs: 1695, kwp: 6481 },
      { name: 'Atria Renewable Pvt Ltd', phone: '8792929001', rating: 5, ratings: 570, installs: 562, kwp: 1967 },
      { name: 'Ecosoch Solar Private Limited', phone: '8123410101', rating: 4.9, ratings: 333, installs: 408, kwp: 2164 },
      { name: 'Interglacial Renewable Technologies Pvt Ltd', phone: '9158159154', rating: 4.9, ratings: 609, installs: 379, kwp: 1555 },
      { name: 'Sunesteem India Private Limited', phone: '7892620714', rating: 5, ratings: 291, installs: 334, kwp: 1666 },
      { name: 'Power Rays', phone: '8970820110', rating: 5, ratings: 303, installs: 329, kwp: 1459 },
    ],
  },
];

/** One vendor as it is kept below: name, number, rating, how many rated, installations, kWp. */
type Row = [name: string, phone: string, rating: number, ratings: number, installs: number, kwp: number];

/** Each state or union territory, the district its list was read under, and its vendors with the most installations in the state, most first. */
const STATE_ROWS: [state: string, via: string, rows: Row[]][] = [
  [
    'Andaman and Nicobar Islands',
    'South Andamans',
    [
      ['Safehandsenviro Facility Management Private Limited', '9391719290', 5, 145, 144, 475],
      ['Spahj India Trading Private Limited', '9002131994', 4.9, 140, 140, 442],
      ['RMC Akshay Urja Shop', '9434273797', 5, 127, 127, 423],
      ['Meenashi Solar, Madurai', '8072762601', 4.9, 230, 47, 141],
      ['Moopens Energy Solutions Private Limited', '9946788884', 5, 4789, 41, 130],
    ],
  ],
  [
    'Andhra Pradesh',
    'Visakhapatnam',
    [
      ['Freyr Energy Services Pvt Ltd', '9154024405', 4.7, 15422, 6246, 22239],
      ['Ellvin Industries', '9467729999', 5, 3706, 3704, 12212],
      ['Southern Global Energy', '8885433309', 5, 2546, 2867, 10153],
      ['Sri Satya Sai Enterprises', '8886559499', 4.2, 1979, 1950, 6525],
      ['Sunrays Green Power Solutions', '9959828292', 5, 1797, 1929, 6530],
      ['Suntek Energy Systems Private Limited', '8712021590', 5, 4991, 1857, 6300],
    ],
  ],
  [
    'Arunachal Pradesh',
    'Papum Pare',
    [
      ['Huto Solar House', '9856022581', 0, 0, 2, 12],
      ['Punampallab Enterprises', '7896448930', 5, 304, 1, 3],
      ['Atibha India Developers Private Limited', '9859030377', 4.9, 1184, 1, 4],
    ],
  ],
  [
    'Assam',
    'Kamrup Metro',
    [
      ['S.H Solar House', '9954570189', 4.8, 1618, 1667, 5348],
      ['H S Enterprise', '8638266501', 5, 1578, 1580, 5109],
      ['Wazifa Enterprise', '9101732582', 4.3, 1463, 1464, 4570],
      ['M.A. Hai Enterprise', '9101523618', 4.9, 1412, 1464, 4597],
      ['Noor Enterprise', '7002921159', 4.9, 1307, 1335, 4360],
    ],
  ],
  [
    'Bihar',
    'Patna',
    [
      ['MN Energy and Infra Private Limited', '9220131444', 4.9, 1701, 1085, 3841],
      ['Kalyan Electronics Industries', '7870717662', 5, 612, 613, 2018],
      ['Sharda Enterprises', '9199845321', 5, 573, 570, 1939],
      ['Shyla Agrotech Solar', '9934022366', 5, 546, 546, 1848],
      ['Solar Planets', '8447552720', 5, 484, 516, 2063],
      ['RVP Enterprises', '7321090567', 4.9, 378, 502, 1799],
    ],
  ],
  [
    'Chandigarh',
    'Chandigarh',
    [
      ['Dharma Electrical Works', '7986521265', 4.8, 253, 286, 1375],
      ['Aarush Solar Specturm', '9914301955', 4.9, 170, 236, 1165],
      ['Inter Solar Systems Pvt. Ltd', '9357834139', 4.9, 328, 170, 714],
      ['Ekam Energy', '9577330005', 4.9, 168, 130, 654],
      ['Winsolar Solutions LLP', '7696311111', 5, 256, 94, 407],
      ['Diamond Renewable Solutions Pvt. Ltd.', '9815067680', 5, 118, 81, 331],
    ],
  ],
  [
    'Chhattisgarh',
    'Raipur',
    [
      ['GDA Solar Pvt Ltd', '7987152376', 4.4, 2804, 2636, 8810],
      ['GSMR Solar Private Limited', '9340540687', 4.9, 2364, 2289, 7735],
      ['Mahadev Traders', '9243092807', 4.7, 1259, 1256, 4178],
      ['M/s. Samiksha Construction', '9039026731', 4.8, 1105, 1095, 3685],
      ['N K Construction', '8120220044', 5, 933, 932, 3167],
      ['Aachal Solar Solutions', '8236003900', 4.9, 934, 931, 3188],
    ],
  ],
  [
    'Dadra and Nagar Haveli and Daman and Diu',
    'Daman',
    [
      ['Krishna Enterprise', '9925356668', 5, 1308, 80, 329],
      ['Dipal Electricals Private Limited', '8866619747', 5, 66, 66, 236],
      ['Solaris Techno', '8767917570', 4.8, 475, 49, 175],
      ['The Mechtech Solutions', '9714928728', 5, 220, 41, 187],
      ['Instant Technology', '8200782232', 4.7, 754, 34, 155],
      ['N M Power', '8141958041', 4.7, 119, 32, 133],
    ],
  ],
  [
    'Delhi',
    'New Delhi',
    [
      ['SolarSquare', '9830003000', 4.9, 52728, 1219, 5492],
      ['Eastern Light and Power Pvt. Ltd.', '9818230950', 4.8, 1800, 729, 3134],
      ['Rosol Energy Private Limited', '8448446252', 5, 636, 690, 2864],
      ['MN Energy and Infra Private Limited', '9220131444', 4.9, 1701, 556, 2092],
      ['Bhambri Solar Private', '9811759494', 4.9, 498, 507, 2331],
      ['Energific Solar Private Limited', '9599035315', 4.9, 433, 503, 2623],
    ],
  ],
  [
    'Goa',
    'North Goa',
    [
      ['Kunde Solar Solutions', '8956330538', 4.9, 618, 640, 5886],
      ['JN Solar Power LLP', '9370208917', 5, 363, 369, 3333],
      ['Zesso Ventures Pvt. Ltd', '9769977573', 4.6, 293, 318, 2944],
      ['Anmax Energy Pvt. Ltd.', '8999743667', 4.4, 258, 289, 2417],
      ['Solstar Ultima LLP', '7720999487', 5, 306, 279, 2065],
      ['Saiyog Solar', '7276227564', 5, 184, 202, 1630],
    ],
  ],
  [
    'Gujarat',
    'Ahmedabad',
    [
      ['Bhanu PV Solar Pvt Ltd', '7405509328', 4.6, 11514, 10686, 37220],
      ['Infrax Renewable Limited', '9917599975', 5, 8454, 9753, 34628],
      ['Australian Premium Solar India Pvt Ltd', '7966006600', 5, 5897, 7915, 28936],
      ['Solar Ace', '9586722221', 5, 5827, 7250, 27316],
      ['Efarm International Private Limited', '9723610012', 5, 5954, 7058, 24405],
      ['Powershine Energy', '9723096888', 5, 5581, 6637, 23355],
    ],
  ],
  [
    'Haryana',
    'Gurugram',
    [
      ['Envision Enterprises', '7056303951', 4.8, 2450, 2717, 8312],
      ['Numberdar Enterprises', '8053035530', 5, 2045, 2390, 8101],
      ['Sunrises Solar Solution', '9991857419', 4.9, 1782, 2036, 10035],
      ['Ishaan Bright Energy OPC Pvt', '9671202019', 4.9, 1650, 1955, 6786],
      ['M/s Maven Solar (P) Ltd.', '9671799866', 4.4, 1280, 1633, 6140],
      ['Shravya Solar Technologies Pvt Ltd', '9588522564', 5, 1527, 1597, 5355],
    ],
  ],
  [
    'Himachal Pradesh',
    'Shimla',
    [
      ['MS HM Solar', '9318706286', 5, 1611, 1607, 5330],
      ['Milani Touchlife Solar Energy Private Limited', '9418021140', 4.9, 830, 894, 3176],
      ['Sharma Trader', '8894551698', 5, 662, 662, 2166],
      ['Sharma Electricals', '8261815825', 5, 527, 542, 1914],
      ['Star Sales', '9816183862', 4.9, 451, 474, 1582],
      ['M/s Raju Enterprises Amb', '9418167880', 4.7, 402, 458, 1603],
    ],
  ],
  [
    'Jammu and Kashmir',
    'Jammu',
    [
      ['Malik Solar Tech', '9596596963', 4.9, 1801, 1800, 6063],
      ['Kashmir Renewable Energy', '7006240191', 4.9, 1615, 1699, 6723],
      ['FBI Multiventures', '9596891244', 5, 1379, 1417, 5030],
      ['M/s Nehru Solar Solutions', '9596349311', 4.9, 1008, 1008, 3813],
      ['Khan Solar & Electronics', '9797949417', 4.9, 713, 713, 2275],
      ['S.T Engineers & Suppliers', '7006804376', 5, 688, 688, 2502],
    ],
  ],
  [
    'Jharkhand',
    'Ranchi',
    [
      ['Surya Mitra Enterprises', '6201967884', 5, 310, 311, 1262],
      ['Solar Natural Power', '9431720665', 5, 278, 277, 1402],
      ['Sologix Energy Private Limited', '9031018640', 4.5, 249, 235, 1011],
      ['Shri Narayani Powers', '9874090409', 4.9, 178, 176, 850],
      ['AD Enterprises', '7903257193', 4.8, 161, 162, 654],
      ['Alliance Enterprises', '9570249546', 5, 139, 139, 648],
    ],
  ],
  [
    'Karnataka',
    'Bengaluru Urban',
    [
      ['SELCO Solar Light Pvt. Ltd', '6364226069', 4.7, 1745, 1789, 5681],
      ['SolarSquare', '9830003000', 4.9, 52711, 1738, 6636],
      ['Re-Invigorate Ventures Pvt. Ltd.', '8050582116', 5, 684, 812, 3233],
      ['Sky Energy Tata Solar Mangaluru', '9739133775', 5, 496, 600, 2610],
      ['Atria Renewable Pvt Ltd', '8792929001', 5, 570, 600, 2097],
      ['SS Agencies', '9449846798', 5, 479, 564, 2468],
    ],
  ],
  [
    'Kerala',
    'Thiruvananthapuram',
    [
      ['Powergene Solar Pvt. Ltd.', '9567855855', 5, 10504, 11150, 40484],
      ['Virgin Power and Engineering Pvt Ltd', '7356606656', 4.9, 8344, 8785, 34078],
      ['Ecofull Resources Pvt Ltd.', '7559086000', 4.9, 5858, 8337, 34801],
      ['El Sol Power Solutions Pvt. Ltd.', '7902222971', 4.9, 6701, 7035, 26252],
      ['Moopens Energy Solutions Private Limited', '9946788884', 5, 4788, 4345, 17023],
      ['Surya Prabha Enterprises', '9895007533', 5, 2818, 3236, 11948],
    ],
  ],
  [
    'Ladakh',
    'Leh Ladakh',
    [
      ['Softtech Enterprises', '9797468102', 4.9, 789, 815, 2628],
      ['Silk Route Energy Private Limited', '9833672360', 5, 587, 653, 2182],
      ['Himalayan Renewable Energy & Construction Firm', '6005722574', 5, 190, 214, 741],
      ['Ladakh Solar Energy Leh', '9797584742', 5, 187, 210, 667],
      ['Demazong Enterprises', '9906978631', 4.9, 128, 141, 465],
      ['D2D Enterprises', '7006952704', 5, 468, 103, 318],
    ],
  ],
  [
    'Lakshadweep',
    'Lakshadweep District',
    [
      ['Moopens Energy Solutions Private Limited', '9946788884', 5, 4789, 1071, 3589],
      ['Thapas Energy', '7356600576', 4.5, 1470, 107, 351],
      ['Renvolt Energy Solutions', '8075884613', 5, 805, 102, 345],
      ['Recon Energy India Pvt. Ltd.', '9745094949', 4.8, 729, 86, 288],
      ['Ziarra Tech Solutions Private Limited', '7907444520', 5, 96, 42, 140],
      ['Binmin Power Systems', '9847058377', 5, 2374, 13, 42],
    ],
  ],
  [
    'Madhya Pradesh',
    'Indore',
    [
      ['SolarSquare', '9830003000', 4.9, 52709, 11328, 45620],
      ['Newsol PV Power Pvt Ltd', '9399064323', 4.9, 2444, 2705, 8875],
      ['Mahavir Multi Enginnering', '8827008014', 4.6, 2483, 2491, 8241],
      ['Freyr Energy Services Pvt Ltd', '9154024405', 4.7, 15422, 2269, 8550],
      ['Autosys Indore', '9993827008', 4.8, 1690, 1966, 7165],
      ['RD Power & Infra Solution', '8269768822', 4.5, 1675, 1959, 7255],
    ],
  ],
  [
    'Maharashtra',
    'Pune',
    [
      ['SolarSquare', '9830003000', 4.9, 52709, 25196, 100265],
      ['Solcap Solar Power Private Limited', '9296969292', 4.9, 4504, 4895, 16717],
      ['Freyr Energy Services Pvt Ltd', '9154024405', 4.7, 15422, 3664, 12944],
      ['ECE India Energies Private Limited', '9146019181', 4.8, 2103, 2767, 9911],
      ['Renew Green Power', '8975885757', 4.9, 2336, 2756, 9265],
      ['Sudarshan Saur Shakti Pvt Ltd', '8805356262', 4.5, 2455, 2696, 9634],
    ],
  ],
  [
    'Manipur',
    'Imphal West',
    [
      ['S.S. Electronics', '8974571965', 5, 309, 317, 1450],
      ['Lurel Taret Enterprise', '7640875380', 4.8, 185, 208, 815],
      ['Loushing Enterprises', '8415920423', 5, 161, 161, 574],
      ['Maaito and Sons Pvt. Ltd', '6006681415', 5, 144, 152, 554],
      ['Nuwatt Energy', '8974762922', 5, 148, 148, 489],
      ['Mangaal Sustainable Solutions Pvt. Ltd', '8415921324', 5, 145, 146, 556],
    ],
  ],
  [
    'Meghalaya',
    'East Khasi Hills',
    [
      ['M/s Bin Services', '8415927183', 0, 0, 35, 102],
      ['North East Power Infra', '8132953691', 0, 0, 19, 98],
      ['M/s Samved Energy Systems Pvt. Ltd.', '7350003593', 0, 0, 10, 10],
      ['Alfiya Infratech Private Limited', '6266504067', 4.9, 213, 6, 19],
      ['Kiron Power India', '9864556634', 0, 0, 3, 9],
      ['Meghalaya Enterprise', '8787464319', 0, 0, 2, 6],
    ],
  ],
  [
    'Mizoram',
    'Aizawl',
    [
      ['Thlado Green Tech', '6009365022', 5, 736, 777, 3107],
      ['Swastik Enterprises', '9831052043', 5, 489, 487, 2136],
      ['Aien Consulting', '8257942943', 5, 73, 73, 285],
      ['Thangruma Projects', '8837439795', 5, 69, 69, 301],
      ['Ten Joules', '7005237249', 4.9, 68, 68, 308],
      ['LT Skylite', '8794446336', 4.7, 66, 66, 259],
    ],
  ],
  [
    'Nagaland',
    'Kohima',
    [
      ['M/s Aboriginal Energy Pvt. Ltd', '9245042993', 5, 178, 178, 600],
      ['Elmechent', '6909314434', 5, 160, 160, 563],
      ['A & D Solar Enterprise', '7085995991', 4.9, 125, 89, 292],
      ['Symbios Green Energy', '7085942521', 5, 62, 61, 194],
      ['M/s Smart Tech', '9856544537', 4.8, 63, 60, 201],
      ['Native Enterprises', '6009846019', 4.7, 57, 55, 167],
    ],
  ],
  [
    'Odisha',
    'Khordha',
    [
      ['Omm Energy Solutions', '8448794277', 5, 2744, 2756, 8647],
      ['SAP Communication', '9937045379', 5, 2304, 2304, 7234],
      ['Urja Group of Company', '9090976555', 5, 2170, 2178, 6980],
      ['5S Energy', '9556199895', 5, 1930, 1927, 5880],
      ['Kalinga Renewable Energy Manufacturers Pvt Ltd', '8093501949', 4.9, 1566, 1710, 5621],
      ['Kamini Infrastructure and Developers', '9861598382', 4.8, 1524, 1530, 4820],
    ],
  ],
  [
    'Puducherry',
    'Puducherry',
    [
      ['Gateway Electric Infra, Perambalur', '9345400639', 5, 442, 409, 1467],
      ['Jai Solar Energy Management Systems, Vilupuram', '9843071622', 4.9, 813, 396, 1340],
      ['Technaus Renewable Pvt. Ltd.', '7418650503', 5, 637, 371, 1417],
      ['Yali Energies India Pvt. Ltd.', '8489639994', 4.6, 465, 322, 1269],
      ['Sterlawn Power India Pvt Ltd', '8015081565', 4.6, 516, 321, 1114],
      ['Power World Systems', '9842784934', 5, 215, 209, 775],
    ],
  ],
  [
    'Punjab',
    'Ludhiana',
    [
      ['Vinayak Solar Hub & Electronics', '9814161770', 4.9, 512, 604, 2732],
      ['A.P Technologies', '9815438251', 5, 322, 418, 1768],
      ['Dynex Solar Private Limited', '7888352440', 4.8, 307, 384, 1430],
      ['Dinkar PV Technologies', '7837870786', 4.9, 1003, 378, 1455],
      ['Solar House', '9878822280', 5, 295, 363, 1508],
      ['Excellent Solar Kotkapura', '7719652727', 5, 311, 338, 1456],
    ],
  ],
  [
    'Rajasthan',
    'Jaipur',
    [
      ['Milan Sour Urja Kendra', '7877057615', 5, 5318, 5935, 23172],
      ['M.K. Solar Energy', '9785514441', 4.8, 3031, 3471, 16317],
      ['M/s Om Solar Energy', '6375464133', 4.7, 2963, 3248, 12062],
      ['Smart Sun Power', '7240004188', 4.8, 2635, 3028, 12654],
      ['Solispower Greentech Private Limited', '9785654000', 4.8, 2031, 2633, 10797],
      ['Rizel Group', '9928556986', 4.9, 2439, 2519, 9553],
    ],
  ],
  [
    'Sikkim',
    'Gangtok',
    [
      ['Infinity Agency', '9832322211', 0, 0, 23, 70],
      ['PPHE Private Limited', '7063679611', 0, 0, 18, 74],
      ['Council for Agriculture & Rural Development (CARD)', '7369873133', 0, 0, 11, 27],
      ['Tashi Namgyal Solar Light', '9733312584', 0, 0, 7, 22],
      ['Zemiratechno Constructions', '7076229885', 0, 0, 3, 9],
      ['Reach Sikkim', '7602721421', 0, 0, 3, 11],
    ],
  ],
  [
    'Tamil Nadu',
    'Chennai',
    [
      ['SolarSquare', '9830003000', 4.9, 52709, 1851, 7661],
      ['Solarrun Energies Private Limited', '9003352474', 5, 1795, 1796, 7596],
      ['Kondaas Automation Pvt Ltd', '9245725603', 4.9, 3705, 1716, 6404],
      ['Darling Digital World Private Limited, Vellore', '9363405274', 5, 1559, 1378, 4934],
      ['Mexicon Technologies, Coimbatore', '9843044494', 4.4, 876, 1286, 4450],
      ['Sri Gounder Auto Spares, Erode', '9865731591', 4.8, 984, 1194, 3909],
    ],
  ],
  [
    'Telangana',
    'Hyderabad',
    [
      ['Freyr Energy Services Pvt Ltd', '9154024405', 4.7, 15422, 2905, 11305],
      ['Suntek Energy Systems Private Limited', '8712021590', 5, 4991, 2233, 8699],
      ['SolarSquare', '9830003000', 4.9, 52711, 2098, 8312],
      ['Prajval PVRSM Solar Solutions', '8328202029', 5, 1778, 1819, 7024],
      ['Sri Balaji Solar Energies', '9959491774', 5, 1582, 1779, 6204],
      ['Nxgyudha Marketing Private Limited', '9063588660', 5, 1137, 1138, 3956],
    ],
  ],
  [
    'Tripura',
    'West Tripura',
    [
      ['Mahamaya Traders', '9436331271', 5, 639, 639, 2097],
      ['Maa Bipadnashini Enterprise', '9856565661', 5, 374, 372, 1279],
      ['HR Ignite Innovative India Private Limited', '7005682736', 5, 344, 340, 1135],
      ['Aditwa Solar Energy Pvt. Ltd.', '8729884091', 4.9, 322, 323, 1043],
      ['APN Solar Energy Pvt Ltd', '9702034043', 4.9, 5176, 282, 931],
    ],
  ],
  [
    'Uttar Pradesh',
    'Lucknow',
    [
      ['SolarSquare', '9830003000', 4.9, 52709, 8974, 36830],
      ['Green Shine Solar', '8115663132', 4.8, 4558, 4693, 15457],
      ['Akupaad Marketing Pvt. Ltd.', '9506037000', 4.9, 3146, 3729, 12588],
      ['Hanumat Solar House', '8756424152', 4.6, 3457, 3455, 9128],
      ['Vortex Solar Energy Private Limited', '9682805554', 4.8, 3410, 3334, 12635],
      ['Ram Raja Solar Power Green Energy', '9935965454', 4.9, 2603, 2842, 9817],
    ],
  ],
  [
    'Uttarakhand',
    'Dehradun',
    [
      ['Mahakali Traders', '9997416516', 4.9, 1778, 1921, 6658],
      ['Shri Badrinath Vaikalpik Urja Limited', '9758639375', 4.9, 1630, 1571, 5303],
      ['Bhumi Ka Solar Pvt Ltd', '9818245976', 4.8, 1386, 1547, 5643],
      ['Aditya Green Power', '9568224222', 4.9, 1166, 1481, 5712],
      ['Power Solutions', '7017872155', 5, 1300, 1366, 4728],
      ['Sustainable Himalayas Infrastructure Solutions', '7455853737', 4.9, 1093, 1309, 4560],
    ],
  ],
  [
    'West Bengal',
    'Kolkata',
    [
      ['Dynamic Control', '9681606072', 4.8, 583, 602, 1982],
      ['Somriddhi Digital Private Limited', '9830354542', 5, 602, 592, 1900],
      ['Evergreen Solar', '7074833525', 4.9, 521, 523, 1872],
      ['P.T. Enterprise', '9147756708', 4.9, 481, 480, 1473],
      ['Durga Solar Enterprise', '9434499151', 4.5, 338, 334, 964],
      ['Evana Electricals Private Limited', '9831815747', 4.7, 302, 294, 968],
    ],
  ],
];

const STATES: VendorList[] = STATE_ROWS.map(([state, via, rows]) => ({
  scope: 'state',
  place: state,
  state,
  via,
  readOn: READ_ON,
  vendors: rows.map(([name, phone, rating, ratings, installs, kwp]) => ({ name, phone, rating, ratings, installs, kwp })),
}));

/** Every list there is: the districts' own, then the states'. */
export const VENDOR_LISTS: readonly VendorList[] = [...DISTRICTS, ...STATES];

/** A district's name with the map's trimmings off: "Kasaragod district", "Bangalore Urban". */
const plain = (s?: string) => (s ?? '').toLowerCase().replace(/\b(district|urban|rural)\b/g, '').replace(/[^a-z]/g, '');

/** A state's name as people and maps write it, brought to one form: "NCT of Delhi", "Jammu & Kashmir", "Orissa". */
const OTHER_NAMES: Record<string, string> = { nctofdelhi: 'delhi', nationalcapitalterritoryofdelhi: 'delhi', newdelhi: 'delhi', orissa: 'odisha', pondicherry: 'puducherry', uttaranchal: 'uttarakhand' };
const plainState = (s?: string) => {
  const bare = (s ?? '').toLowerCase().replace(/\b(the|and)\b/g, '').replace(/[^a-z]/g, '');
  return OTHER_NAMES[bare] ?? bare;
};

/**
 * The registered vendors for a place: its district's own list when that has been read, and
 * otherwise the busiest vendors of its state. With neither the district nor the state known
 * there is nothing, and Dhoop says where the list is instead of guessing.
 */
export function vendorsFor(district?: string, state?: string): VendorList | undefined {
  const want = plain(district).replace('bangalore', 'bengaluru');
  const own = want.length >= 4 ? DISTRICTS.find((l) => plain(l.place) === want) : undefined;
  if (own) return own;
  const inState = plainState(state);
  return inState.length >= 3 ? STATES.find((l) => plainState(l.place) === inState) : undefined;
}

/** The districts whose own lists have been read, and the states and union territories with a list, for saying which they are. */
export const VENDOR_DISTRICTS = DISTRICTS.map((l) => l.place);
export const VENDOR_STATES = STATES.map((l) => l.place);
