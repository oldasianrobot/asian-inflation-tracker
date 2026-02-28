/**
 * Vercel Serverless Function: /api/rebuild
 * 
 * Triggered by Vercel Cron monthly (15th of each month).
 * Calls the Vercel Deploy Hook to trigger a fresh build,
 * which runs the prebuild script to fetch new data.
 */

export default async function handler(req, res) {
    // Verify this is a legitimate cron request
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
    if (!deployHookUrl) {
        return res.status(500).json({ error: 'VERCEL_DEPLOY_HOOK_URL not configured' });
    }

    try {
        const response = await fetch(deployHookUrl, { method: 'POST' });

        if (!response.ok) {
            return res.status(500).json({
                error: 'Deploy hook failed',
                status: response.status,
            });
        }

        const result = await response.json();
        return res.status(200).json({
            message: 'Rebuild triggered successfully',
            deployment: result,
            triggeredAt: new Date().toISOString(),
        });
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to trigger rebuild',
            details: err.message,
        });
    }
}
