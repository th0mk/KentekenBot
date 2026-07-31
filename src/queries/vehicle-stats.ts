import { Sighting } from '../models/sighting';
import { Vehicle } from '../models/vehicle';
import { StatsCalculator } from '../util/stats-calculator';
import { StatsProfile, StatSpot } from '../types/stats';

export class VehicleStats {
    public static async forUser(discordUserId: string, discordGuildId: string | null = null): Promise<StatsProfile> {
        const where: Record<string, string> = { discordUserId };

        if (discordGuildId) {
            where.discordGuildId = discordGuildId;
        }

        const sightings = await Sighting.findAll({
            where,
            include: [
                {
                    model: Vehicle,
                    as: 'vehicle',
                    required: false,
                },
            ],
        });

        const spots: StatSpot[] = [];
        for (const sighting of sightings) {
            const vehicle = sighting.vehicle;
            spots.push({
                license: sighting.license,
                createdAt: sighting.createdAt,
                vehicle: vehicle
                    ? {
                          brand: vehicle.brand,
                          tradeName: vehicle.tradeName,
                          price: vehicle.price,
                          primaryFuelType: vehicle.primaryFuelType,
                          dateFirstAllowed: vehicle.dateFirstAllowed ?? null,
                      }
                    : null,
            });
        }

        return StatsCalculator.compute(spots);
    }
}
