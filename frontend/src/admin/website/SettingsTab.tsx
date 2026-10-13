import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import type { SiteSettings } from '@/public/api'
import { api } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'
import { TextAreaField, TextField } from '@/shared/ui/Field'

import type { ImageChange } from './cms'
import { ImageInput } from './ImageInput'
import { FormError, QueryState, TabHeader } from '../kit'

type Values = Omit<SiteSettings, 'hero_image' | 'about_image'>

export default function SettingsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cms', 'settings'],
    queryFn: async () => (await api.get<SiteSettings>('/cms/settings/')).data,
  })
  return (
    <div>
      <TabHeader title="Site settings" intro="Contact details, home page text and the numbers shown on the site." />
      <QueryState isLoading={isLoading} error={error} />
      {data && <SettingsForm settings={data} />}
    </div>
  )
}

function SettingsForm({ settings }: { settings: SiteSettings }) {
  const queryClient = useQueryClient()
  const [hero, setHero] = useState<ImageChange>()
  const [about, setAbout] = useState<ImageChange>()
  const { register, handleSubmit, reset, formState } = useForm<Values>({ defaultValues: settings })

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      // Never send the current image URLs back as JSON — only null (remove) or a file upload.
      const { hero_image: _hero, about_image: _about, ...json } = values as SiteSettings
      if (hero === null) Object.assign(json, { hero_image: null })
      if (about === null) Object.assign(json, { about_image: null })
      let saved = (await api.patch<SiteSettings>('/cms/settings/', json)).data
      if (hero instanceof File || about instanceof File) {
        const form = new FormData()
        if (hero instanceof File) form.append('hero_image', hero)
        if (about instanceof File) form.append('about_image', about)
        saved = (await api.patch<SiteSettings>('/cms/settings/', form)).data
      }
      return saved
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['cms', 'settings'], saved)
      queryClient.invalidateQueries({ queryKey: ['public'] })
      reset(saved)
      setHero(undefined)
      setAbout(undefined)
    },
  })

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
      <Section title="Business & contact">
        <TextField label="Business name" required {...register('business_name')} />
        <TextField label="Tagline" {...register('tagline')} />
        <TextField label="Phone" {...register('phone')} />
        <TextField label="Phone 2" hint="Optional second number" {...register('phone_2')} />
        <TextField label="WhatsApp number" hint="Digits with country code, e.g. 919876543210" {...register('whatsapp')} />
        <TextField label="Email" type="email" {...register('email')} />
        <TextField label="City" {...register('city')} />
        <TextAreaField label="Address" className="sm:col-span-2" {...register('address')} />
        <TextField label="Business hours" {...register('business_hours')} />
        <TextField label="Google Maps embed URL" hint="Maps → Share → Embed a map → copy the src link" {...register('map_embed_url')} />
      </Section>

      <Section title="Social links">
        <TextField label="Instagram URL" {...register('instagram_url')} />
        <TextField label="Facebook URL" {...register('facebook_url')} />
        <TextField label="YouTube URL" {...register('youtube_url')} />
      </Section>

      <Section title="Home page">
        <TextField label="Hero headline" className="sm:col-span-2" {...register('hero_title')} />
        <TextAreaField label="Hero sub-text" className="sm:col-span-2" {...register('hero_subtitle')} />
        <ImageInput label="Hero image" currentUrl={settings.hero_image} value={hero} onChange={setHero} hint="Wide photo, at least 1920px across." />
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Events done" type="number" min={0} {...register('stat_events')} />
          <TextField label="Years" type="number" min={0} {...register('stat_years')} />
          <TextField label="Happy clients" type="number" min={0} {...register('stat_clients')} />
        </div>
      </Section>

      <Section title="About page">
        <TextField label="About headline" className="sm:col-span-2" {...register('about_title')} />
        <TextAreaField label="About text" rows={7} hint="Leave a blank line between paragraphs." className="sm:col-span-2" {...register('about_body')} />
        <ImageInput label="About image" currentUrl={settings.about_image} value={about} onChange={setAbout} />
      </Section>

      <FormError error={mutation.error} />
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-stone-200 bg-stone-50/95 py-3 backdrop-blur">
        <Button type="submit" loading={mutation.isPending}>
          Save settings
        </Button>
        {mutation.isSuccess && !formState.isDirty && <span className="text-sm text-green-700">Saved.</span>}
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-stone-200 bg-white p-5">
      <legend className="px-1 text-sm font-semibold text-stone-800">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}
