{{/*
Expand the name of the chart.
*/}}
{{- define "distribution-service.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "distribution-service.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label and selector labels.
*/}}
{{- define "distribution-service.labels" -}}
helm.sh/chart: {{ include "distribution-service.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{- range $k, $v := .Values.labels }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end }}

{{- define "distribution-service.selectorLabels" -}}
app.kubernetes.io/name: {{ include "distribution-service.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}