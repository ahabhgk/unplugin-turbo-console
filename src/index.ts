import { cwd } from 'node:process'
import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import { checkPort, getRandomPort } from 'get-port-please'
import { relative } from 'pathe'
import type { Context, Options } from './types'
import { PLUGIN_NAME, clientVirtualModuleId, helperVirtualModuleId, resolvedClientVirtualModuleId, resolvedHelperVirtualModuleId } from './core/constants'
import { createServer } from './core/server/index'
import { filter, loadPkg, printInfo } from './core/utils'
import { resolveOptions } from './core/options'
import { transform } from './core/transform/index'
import { clientVirtualModulesGenerator, helperVirtualModulesGenerator } from './core/virtualModules'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (rawOptions = {}) => {
  const options = resolveOptions(rawOptions)

  async function detectPort() {
    const isAvailable = await checkPort(options.port!)
    if (!isAvailable)
      options.port = await getRandomPort()
  }

  async function startTurboConsoleServer() {
    // Avoid start server multiple times
    if (!globalThis.UNPLUGIN_TURBO_CONSOLE_LAUNCH_SERVER) {
      globalThis.UNPLUGIN_TURBO_CONSOLE_LAUNCH_SERVER = true
      await detectPort()
      printInfo(options)
      createServer(options)
    }
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    transformInclude(id) {
      return filter(id)
    },
    resolveId(id) {
      if (id === clientVirtualModuleId) {
        return resolvedClientVirtualModuleId
      }

      if (id === helperVirtualModuleId)
        return resolvedHelperVirtualModuleId
    },
    load(id) {
      if (id === resolvedClientVirtualModuleId) {
        return clientVirtualModulesGenerator(options.port!)
      }

      if (id === resolvedHelperVirtualModuleId) {
        return helperVirtualModulesGenerator()
      }
    },
    async transform(code, id) {
      try {
        const context: Context = {
          code,
          id,
          options,
        }

        return await transform(context)
      }
      catch (error) {
        console.error(`[${PLUGIN_NAME}]`, `Transform ${relative(cwd(), id)} error:`, error)
        return code
      }
    },
    vite: {
      async configureServer(server) {
        // Avoid start server multiple times
        if (!globalThis.UNPLUGIN_TURBO_CONSOLE_LAUNCH_SERVER) {
          globalThis.UNPLUGIN_TURBO_CONSOLE_LAUNCH_SERVER = true
          await detectPort()
          createServer(options)

          const _print = server.printUrls

          const NuxtKit = await loadPkg('@nuxt/kit')
          if (NuxtKit) {
            printInfo(options)
          }
          else {
            server.printUrls = () => {
              _print()
              printInfo(options)
            }
          }
        }
      },
    },
    farm: {
      configureDevServer() {
        startTurboConsoleServer()
      },
    },
    webpack(compiler) {
      if (compiler.options.mode === 'development') {
        compiler.hooks.done.tap(PLUGIN_NAME, async (state) => {
          if (state.hasErrors())
            return

          startTurboConsoleServer()
        })
      }
    },
    rspack(compiler) {
      if (compiler.options.mode === 'development') {
        compiler.hooks.done.tap(PLUGIN_NAME, async (state) => {
          if (state.hasErrors())
            return

          startTurboConsoleServer()
        })
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
