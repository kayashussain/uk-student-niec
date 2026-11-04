// Starts the whole site. There is one app now: Student Details, with the Incentive page inside it at /incentive.
// (This file stays so `npm start`, Render and deploy.sh keep working; it only sets the port the hosts expect.)
process.env.PORT = process.env.PORT || '8080';
require('../student-details/server.js');
