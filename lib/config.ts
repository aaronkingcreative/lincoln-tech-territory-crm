export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'kenking@northrim.net,aking81@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const TERRITORY_COUNTIES = {
  OR: ['Malheur'],
  ID: ['Canyon','Payette','Washington','Gem','Elmore','Gooding','Jerome','Twin Falls','Cassia','Minidoka','Lincoln','Power','Bannock','Bingham','Bonneville','Jefferson','Madison','Fremont','Teton','Clark'],
};
