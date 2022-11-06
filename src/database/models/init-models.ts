import { Sequelize } from "sequelize";
import { Account as _Account } from "./Account";
import { Gym as _Gym } from "./Gym";
import { Housing as _Housing } from "./Housing";
import { Report as _Report } from "./Report";
import { RefreshToken as _RefreshToken } from "./RefreshToken";
import { ResetToken as _ResetToken } from "./ResetToken";

import { City as _City } from "./City";
import { Provider as _Provider } from "./Provider";
import { Task as _Task } from "./Task";

function initModels(sequelize: Sequelize) {
    const Account = _Account.initModel(sequelize);
    const RefreshToken = _RefreshToken.initModel(sequelize);
    const ResetToken = _ResetToken.initModel(sequelize);
    const Housing = _Housing.initModel(sequelize);
    const Gym = _Gym.initModel(sequelize);
    const City = _City.initModel(sequelize);
    const Provider = _Provider.initModel(sequelize);
    const Task = _Task.initModel(sequelize);

    Account.hasMany(RefreshToken, {
        foreignKey: "acctId",
        as: "their_refresh_tokens",
    });
    RefreshToken.belongsTo(Account, { as: "belongs_to_user", foreignKey: "acctId" });

    Account.hasMany(ResetToken, {
        foreignKey: "acctId",
        as: "their_reset_tokens",
    });
    ResetToken.belongsTo(Account, { as: "belongs_to_user", foreignKey: "acctId" });


    // todo: review these, fix them
    // // Housing
    // Housing.belongsTo(City);

    // // Gym
    // Gym.belongsTo(City);

    // // City
    // City.hasMany(Housing);
    // City.hasMany(Gym);

    // // Provider
    // Provider.hasMany(Task);

    // // Task
    // Task.belongsTo(Provider);

    // todo: make city model. city has many gyms, has many apartments

    return { Account, RefreshToken, ResetToken,  Housing, Gym ,  City,  Provider, Task };






}

export default initModels;
