// Sample 2026 tournament field for development/testing
// This can be replaced with real ESPN data once the bracket is announced

export type SampleTeam = {
  name: string;
  abbreviation: string;
  seed: number;
  region: string;
};

// 64 teams, 16 per region, seeds 1-16
export const SAMPLE_TEAMS: SampleTeam[] = [
  // South Region
  { name: "Houston Cougars", abbreviation: "HOU", seed: 1, region: "South" },
  { name: "Marquette Golden Eagles", abbreviation: "MARQ", seed: 16, region: "South" },
  { name: "Kentucky Wildcats", abbreviation: "UK", seed: 8, region: "South" },
  { name: "Colorado State Rams", abbreviation: "CSU", seed: 9, region: "South" },
  { name: "Purdue Boilermakers", abbreviation: "PUR", seed: 5, region: "South" },
  { name: "High Point Panthers", abbreviation: "HPU", seed: 12, region: "South" },
  { name: "Wisconsin Badgers", abbreviation: "WIS", seed: 4, region: "South" },
  { name: "Montana Grizzlies", abbreviation: "MONT", seed: 13, region: "South" },
  { name: "Arizona Wildcats", abbreviation: "ARIZ", seed: 6, region: "South" },
  { name: "Akron Zips", abbreviation: "AKR", seed: 11, region: "South" },
  { name: "BYU Cougars", abbreviation: "BYU", seed: 3, region: "South" },
  { name: "Colgate Raiders", abbreviation: "COLG", seed: 14, region: "South" },
  { name: "Illinois Fighting Illini", abbreviation: "ILL", seed: 7, region: "South" },
  { name: "Troy Trojans", abbreviation: "TROY", seed: 10, region: "South" },
  { name: "Tennessee Volunteers", abbreviation: "TENN", seed: 2, region: "South" },
  { name: "Wofford Terriers", abbreviation: "WOF", seed: 15, region: "South" },

  // East Region
  { name: "Duke Blue Devils", abbreviation: "DUKE", seed: 1, region: "East" },
  { name: "American Eagles", abbreviation: "AMER", seed: 16, region: "East" },
  { name: "Mississippi State Bulldogs", abbreviation: "MSST", seed: 8, region: "East" },
  { name: "Boise State Broncos", abbreviation: "BSU", seed: 9, region: "East" },
  { name: "Oregon Ducks", abbreviation: "ORE", seed: 5, region: "East" },
  { name: "Liberty Flames", abbreviation: "LIB", seed: 12, region: "East" },
  { name: "Texas Tech Red Raiders", abbreviation: "TTU", seed: 4, region: "East" },
  { name: "UNC Wilmington Seahawks", abbreviation: "UNCW", seed: 13, region: "East" },
  { name: "Missouri Tigers", abbreviation: "MIZ", seed: 6, region: "East" },
  { name: "Drake Bulldogs", abbreviation: "DRKE", seed: 11, region: "East" },
  { name: "Iowa State Cyclones", abbreviation: "ISU", seed: 3, region: "East" },
  { name: "Lipscomb Bisons", abbreviation: "LIP", seed: 14, region: "East" },
  { name: "Clemson Tigers", abbreviation: "CLEM", seed: 7, region: "East" },
  { name: "New Mexico Lobos", abbreviation: "UNM", seed: 10, region: "East" },
  { name: "Alabama Crimson Tide", abbreviation: "ALA", seed: 2, region: "East" },
  { name: "Robert Morris Colonials", abbreviation: "RMU", seed: 15, region: "East" },

  // Midwest Region
  { name: "Auburn Tigers", abbreviation: "AUB", seed: 1, region: "Midwest" },
  { name: "Alabama State Hornets", abbreviation: "ALST", seed: 16, region: "Midwest" },
  { name: "Louisville Cardinals", abbreviation: "LOU", seed: 8, region: "Midwest" },
  { name: "Creighton Bluejays", abbreviation: "CREI", seed: 9, region: "Midwest" },
  { name: "Michigan State Spartans", abbreviation: "MSU", seed: 5, region: "Midwest" },
  { name: "UC San Diego Tritons", abbreviation: "UCSD", seed: 12, region: "Midwest" },
  { name: "Texas A&M Aggies", abbreviation: "TAMU", seed: 4, region: "Midwest" },
  { name: "Yale Bulldogs", abbreviation: "YALE", seed: 13, region: "Midwest" },
  { name: "Ole Miss Rebels", abbreviation: "MISS", seed: 6, region: "Midwest" },
  { name: "San Diego State Aztecs", abbreviation: "SDSU", seed: 11, region: "Midwest" },
  { name: "Florida Gators", abbreviation: "FLA", seed: 3, region: "Midwest" },
  { name: "Norfolk State Spartans", abbreviation: "NSU", seed: 14, region: "Midwest" },
  { name: "Kansas Jayhawks", abbreviation: "KU", seed: 7, region: "Midwest" },
  { name: "Arkansas Razorbacks", abbreviation: "ARK", seed: 10, region: "Midwest" },
  { name: "Michigan Wolverines", abbreviation: "MICH", seed: 2, region: "Midwest" },
  { name: "Omaha Mavericks", abbreviation: "OMA", seed: 15, region: "Midwest" },

  // West Region
  { name: "UConn Huskies", abbreviation: "CONN", seed: 1, region: "West" },
  { name: "SIU Edwardsville Cougars", abbreviation: "SIUE", seed: 16, region: "West" },
  { name: "San Marcos Bobcats", abbreviation: "TXST", seed: 8, region: "West" },
  { name: "Butler Bulldogs", abbreviation: "BUT", seed: 9, region: "West" },
  { name: "Gonzaga Bulldogs", abbreviation: "GONZ", seed: 5, region: "West" },
  { name: "McNeese Cowboys", abbreviation: "MCN", seed: 12, region: "West" },
  { name: "Maryland Terrapins", abbreviation: "UMD", seed: 4, region: "West" },
  { name: "Vermont Catamounts", abbreviation: "UVM", seed: 13, region: "West" },
  { name: "UCLA Bruins", abbreviation: "UCLA", seed: 6, region: "West" },
  { name: "Indiana Hoosiers", abbreviation: "IND", seed: 11, region: "West" },
  { name: "North Carolina Tar Heels", abbreviation: "UNC", seed: 3, region: "West" },
  { name: "Iona Gaels", abbreviation: "IONA", seed: 14, region: "West" },
  { name: "St. John's Red Storm", abbreviation: "SJU", seed: 7, region: "West" },
  { name: "VCU Rams", abbreviation: "VCU", seed: 10, region: "West" },
  { name: "Kansas State Wildcats", abbreviation: "KSU", seed: 2, region: "West" },
  { name: "Northern Kentucky Norse", abbreviation: "NKU", seed: 15, region: "West" },
];
