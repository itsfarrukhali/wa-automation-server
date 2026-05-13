// seed/cities.js
import City from "../src/models/common/citySchema.js";

const citiesData = [
  {
    name: "Karachi",
    province: "Sindh",
    postalCodes: ["74000", "75500", "75600", "75850"],
    popularAreas: [
      { name: "Clifton" },
      { name: "DHA" },
      { name: "Gulshan-e-Iqbal" },
      { name: "Saddar" },
      { name: "North Nazimabad" },
    ],
  },
  {
    name: "Lahore",
    province: "Punjab",
    postalCodes: ["54000", "54500", "54810", "54700"],
    popularAreas: [
      { name: "Gulberg" },
      { name: "DHA" },
      { name: "Model Town" },
      { name: "Johar Town" },
      { name: "Garden Town" },
    ],
  },
  {
    name: "Islamabad",
    province: "ICT",
    postalCodes: ["44000", "45210"],
    popularAreas: [
      { name: "F-6" },
      { name: "F-7" },
      { name: "F-8" },
      { name: "Blue Area" },
      { name: "G-9" },
    ],
  },
  {
    name: "Rawalpindi",
    province: "Punjab",
    postalCodes: ["46000", "46200"],
    popularAreas: [
      { name: "Saddar" },
      { name: "Bahria Town" },
      { name: "Chaklala" },
      { name: "Gulzar-e-Quaid" },
    ],
  },
  {
    name: "Faisalabad",
    province: "Punjab",
    postalCodes: ["38000", "38060"],
    popularAreas: [
      { name: "Jinnah Colony" },
      { name: "Madina Town" },
      { name: "Peoples Colony" },
      { name: "D-Type" },
    ],
  },
  {
    name: "Multan",
    province: "Punjab",
    postalCodes: ["60000", "60700"],
    popularAreas: [
      { name: "Cantt" },
      { name: "Bosan Road" },
      { name: "Gulgasht" },
      { name: "Shah Rukn-e-Alam" },
    ],
  },
  {
    name: "Peshawar",
    province: "KPK",
    postalCodes: ["25000", "25120"],
    popularAreas: [
      { name: "University Town" },
      { name: "Hayatabad" },
      { name: "Saddar" },
      { name: "Cantt" },
    ],
  },
  {
    name: "Quetta",
    province: "Balochistan",
    postalCodes: ["87300", "87800"],
    popularAreas: [
      { name: "Cantt" },
      { name: "Jinnah Town" },
      { name: "Zarghoon Road" },
      { name: "Sariab Road" },
    ],
  },
  {
    name: "Gujranwala",
    province: "Punjab",
    postalCodes: ["52250", "52260"],
    popularAreas: [
      { name: "Model Town" },
      { name: "Satellite Town" },
      { name: "Wapda Town" },
      { name: "G.T. Road" },
    ],
  },
  {
    name: "Sialkot",
    province: "Punjab",
    postalCodes: ["51310", "51340"],
    popularAreas: [
      { name: "Cantt" },
      { name: "Model Town" },
      { name: "Paris Road" },
      { name: "Sambrial" },
    ],
  },
  {
    name: "Hyderabad",
    province: "Sindh",
    postalCodes: ["71000", "71500"],
    popularAreas: [
      { name: "Latifabad" },
      { name: "Qasimabad" },
      { name: "Saddar" },
      { name: "Defence" },
    ],
  },
  {
    name: "Sukkur",
    province: "Sindh",
    postalCodes: ["65200", "65100"],
    popularAreas: [
      { name: "Military Road" },
      { name: "Shikarpur Road" },
      { name: "Arain Road" },
      { name: "Lab-e-Mehran" },
    ],
  },
  {
    name: "Bahawalpur",
    province: "Punjab",
    postalCodes: ["63100", "63200"],
    popularAreas: [
      { name: "Model Town" },
      { name: "Satellite Town" },
      { name: "Islamia Colony" },
      { name: "Cantt" },
    ],
  },
  {
    name: "Sargodha",
    province: "Punjab",
    postalCodes: ["40100", "40200"],
    popularAreas: [
      { name: "Satellite Town" },
      { name: "Block X" },
      { name: "Old Civil Lines" },
      { name: "University Road" },
    ],
  },
  {
    name: "Gujrat",
    province: "Punjab",
    postalCodes: ["50700", "50740"],
    popularAreas: [
      { name: "Rehman Shaheed Road" },
      { name: "Model Town" },
      { name: "Jalalpur Jattan Road" },
      { name: "Sargodha Road" },
    ],
  },
  {
    name: "Jhelum",
    province: "Punjab",
    postalCodes: ["49600", "49620"],
    popularAreas: [
      { name: "Cantt" },
      { name: "Shandar Chowk" },
      { name: "Machine Mohallah" },
      { name: "Kala Gujran" },
    ],
  },
  {
    name: "Sahiwal",
    province: "Punjab",
    postalCodes: ["57000", "57100"],
    popularAreas: [
      { name: "Farid Town" },
      { name: "Chowk Niazi" },
      { name: "Old Grain Market" },
      { name: "High Street" },
    ],
  },
  {
    name: "Wah Cantt",
    province: "Punjab",
    postalCodes: ["47040"],
    popularAreas: [
      { name: "POF Colony" },
      { name: "Wah Model Town" },
      { name: "Lalarukh" },
      { name: "Ordnance Road" },
    ],
  },
  {
    name: "Mardan",
    province: "KPK",
    postalCodes: ["23200", "23300"],
    popularAreas: [
      { name: "Bank Road" },
      { name: "Nowshera Road" },
      { name: "Charsadda Road" },
      { name: "Cantt" },
    ],
  },
  {
    name: "Mingora",
    province: "KPK",
    postalCodes: ["19130", "19140"],
    popularAreas: [
      { name: "Saidu Sharif" },
      { name: "G.T. Road" },
      { name: "Fiza Ghat" },
      { name: "Green Chowk" },
    ],
  },
  {
    name: "Other",
    province: "Other",
    postalCodes: [],
    popularAreas: [],
  },
];

export const seedCities = async () => {
  console.log("🌱 Seeding cities with postal codes and areas...");

  for (const city of citiesData) {
    await City.findOneAndUpdate(
      { name: city.name },
      {
        $set: {
          province: city.province,
          postalCodes: city.postalCodes,
          popularAreas: city.popularAreas.map((area) => ({
            ...area,
            isActive: true, // default active
          })),
          isActive: true,
          serviceAvailable: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  console.log("✅ Cities seeded successfully");
};
